import type { ChessScopeApi, OpponentCandidate, OpponentDossier } from "../types";
import { analyzeGame } from "./analyze";
import * as db from "./db";
import { importChesscom, importLichess, importOpponentChesscom, importOpponentLichess } from "./import";
import { checkStockfish } from "./stockfish-engine";
import {
  backfillOpenings,
  getAnalysisSummary,
  getBlunderPuzzles,
  getPlayerStats,
} from "./stats";

async function searchLichess(query: string): Promise<OpponentCandidate[]> {
  const res = await fetch(
    `https://lichess.org/api/player/autocomplete?term=${encodeURIComponent(query)}&object=1&friend=0`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    result: Array<{ id: string; name: string; title?: string }>;
  };
  return data.result.slice(0, 10).map((u) => ({
    id: `lichess_${u.id}`,
    name: u.name || u.id,
    source: "lichess",
    rating: null,
    federation: u.title ?? null,
    fide_id: null,
    uscf_id: null,
    chessgames_id: null,
    chesscom_username: null,
    lichess_username: u.id,
  }));
}

async function searchChesscom(query: string): Promise<OpponentCandidate[]> {
  const variants = [
    query,
    query.toLowerCase(),
    query.replace(/\s+/g, ""),
  ];
  const seen = new Set<string>();
  const out: OpponentCandidate[] = [];
  for (const v of variants) {
    if (seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    try {
      const res = await fetch(
        `https://api.chess.com/pub/player/${encodeURIComponent(v)}`,
      );
      if (!res.ok) continue;
      const p = (await res.json()) as { username: string; name?: string; country?: string };
      out.push({
        id: `chesscom_${p.username}`,
        name: p.name || p.username,
        source: "chesscom",
        rating: null,
        federation: p.country ?? null,
        fide_id: null,
        uscf_id: null,
        chessgames_id: null,
        chesscom_username: p.username,
        lichess_username: null,
      });
      if (out.length >= 5) break;
    } catch {
      /* skip */
    }
  }
  return out;
}

export const webApi: ChessScopeApi = {
  getSettings: db.getSettings,
  saveSettings: db.saveSettings,

  importChesscom: async (username, maxGames, asOpponent) => {
    const settings = await db.getSettings();
    const opts = asOpponent ? { isOwnGame: false } : { isOwnGame: true };
    return importChesscom(username, maxGames ?? settings.default_game_count ?? 100, opts);
  },

  importLichess: async (username, maxGames, asOpponent) => {
    const settings = await db.getSettings();
    const opts = asOpponent ? { isOwnGame: false } : { isOwnGame: true };
    return importLichess(username, maxGames ?? settings.default_game_count ?? 100, opts);
  },

  syncAll: async () => {
    const s = await db.getSettings();
    const results = [];
    if (s.chesscom_username) {
      results.push(
        await importChesscom(s.chesscom_username, s.default_game_count ?? 100),
      );
    }
    if (s.lichess_username) {
      results.push(
        await importLichess(s.lichess_username, s.default_game_count ?? 100),
      );
    }
    if (!results.length) {
      throw new Error("Add Chess.com or Lichess username in Settings first.");
    }
    return results;
  },

  listGames: (limit, offset, ownOnly) => db.listGames(limit, offset, ownOnly),
  getGameCount: db.getGameCount,
  getScoutedGameCount: db.getScoutedGameCount,
  getPlayerStats,
  backfillOpenings,

  lookupUscf: async (uscfId) => {
    const res = await fetch(
      `https://ratings-api.uschess.org/api/v1/members/${encodeURIComponent(uscfId)}`,
    );
    if (!res.ok) throw new Error(`USCF lookup failed (${res.status})`);
    const m = await res.json();
    return {
      id: m.id,
      first_name: m.firstName,
      last_name: m.lastName,
      state: m.stateRep ?? null,
      fide_id: m.fideId ?? null,
      status: m.status ?? null,
      ratings: (m.ratings ?? []).map(
        (r: {
          ratingSystem: string;
          rating?: number;
          gamesPlayed?: number;
          isProvisional: boolean;
        }) => ({
          rating_system: r.ratingSystem,
          rating: r.rating ?? null,
          games_played: r.gamesPlayed ?? null,
          is_provisional: r.isProvisional,
        }),
      ),
    };
  },

  checkOllama: async () => ({
    connected: false,
    models: [],
    error: "AI Coach requires the desktop app or a local Ollama instance.",
  }),

  coachChat: async () => {
    throw new Error(
      "AI Coach is not available in the browser version. Use the desktop app with Ollama.",
    );
  },

  checkStockfish,
  getGameAnalysis: db.getAnalysis,

  analyzeGame: async (gameId) => {
    const settings = await db.getSettings();
    return analyzeGame(gameId, settings.analysis_depth ?? 14);
  },

  analyzePendingGames: async (limit = 10) => {
    const games = await db.allStoredGames();
    const pending = games.filter((g) => g.is_own_game && !g.analyzed_at);
    let count = 0;
    for (const g of pending.slice(0, limit)) {
      await webApi.analyzeGame(g.id);
      count++;
    }
    return count;
  },

  getAnalysisSummary,
  getBlunderPuzzles,
  submitPuzzleAttempt: async (puzzleId, solved, _timeSecs) => {
    if (solved) await db.recordPuzzleAttempt(puzzleId, true);
  },

  searchOpponents: async (query, sources) => {
    const want = (src: string) =>
      !sources?.length || sources.some((s) => s.toLowerCase() === src.toLowerCase());
    const results: OpponentCandidate[] = [];
    if (want("uscf") || want("online")) {
      /* USCF name search needs backend — skip on web */
    }
    if (want("lichess") || want("online")) {
      results.push(...(await searchLichess(query)));
    }
    if (want("chesscom") || want("online")) {
      results.push(...(await searchChesscom(query)));
    }
    if (!results.length) {
      throw new Error(`No opponents found for "${query}" (web: try Lichess/Chess.com username)`);
    }
    return results;
  },

  buildOpponentDossier: async (candidate): Promise<OpponentDossier> => {
    let imported = 0;
    if (candidate.lichess_username) {
      const r = await importOpponentLichess(candidate.lichess_username, 30);
      imported += r.imported;
    } else if (candidate.chesscom_username) {
      const r = await importOpponentChesscom(candidate.chesscom_username, 30);
      imported += r.imported;
    }
    const emptyRecord = {
      wins: 0,
      draws: 0,
      losses: 0,
      as_white: { games: 0, wins: 0, draws: 0, losses: 0 },
      as_black: { games: 0, wins: 0, draws: 0, losses: 0 },
    };
    return {
      candidate,
      games_imported: imported,
      games_imported_chesscom: candidate.chesscom_username ? imported : 0,
      games_imported_lichess: candidate.lichess_username ? imported : 0,
      games_imported_chessgames: 0,
      opening_lines: [],
      openings_as_white: [],
      openings_as_black: [],
      record: emptyRecord,
      recent_games: [],
      ratings: [],
      style_summary: imported
        ? `Imported ${imported} opponent games — view under Analysis → Scouted games.`
        : "Link a Lichess or Chess.com username to import games.",
      tactical_notes: "Full dossier stats available in the desktop app.",
      recommended_prep: "Review imported games in Analysis and note recurring openings.",
      ai_insight: null,
    };
  },

  repairScoutGames: () => db.repairScoutGames(),
};
