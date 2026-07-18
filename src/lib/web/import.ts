import { openingLabel } from "../chess";
import type { ImportResult } from "../types";
import * as db from "./db";

export type ImportOptions = {
  /** false = opponent/scout games (excluded from your dashboard stats) */
  isOwnGame: boolean;
};

const OWN: ImportOptions = { isOwnGame: true };
const OPPONENT: ImportOptions = { isOwnGame: false };

function extractHeaders(pgn: string): { eco?: string; opening?: string } {
  const result: { eco?: string; opening?: string } = {};
  for (const line of pgn.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("[")) break;
    const eco = t.match(/\[ECO\s+"([^"]+)"\]/i);
    const opening = t.match(/\[Opening\s+"([^"]+)"\]/i);
    if (eco) result.eco = eco[1];
    if (opening) result.opening = opening[1];
  }
  return result;
}

function normalizeChesscomResult(
  whiteResult: string,
  blackResult: string,
  username: string,
  whiteUser: string,
): { result: string; isWhite: boolean; ownColor: string } {
  const isWhite = whiteUser.toLowerCase() === username.toLowerCase();
  const ownResult = isWhite ? whiteResult : blackResult;
  const result =
    ownResult === "win"
      ? "win"
      : ["checkmated", "timeout", "resigned", "lose", "abandoned"].includes(
            ownResult,
          )
        ? "loss"
        : "draw";
  return { result, isWhite, ownColor: isWhite ? "white" : "black" };
}

export async function importLichess(
  username: string,
  maxGames: number,
  options: ImportOptions = OWN,
): Promise<ImportResult> {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${maxGames}&opening=true&clocks=false&perfType=rapid,blitz,classical&rated=true`;
  const res = await fetch(url, {
    headers: { Accept: "application/x-ndjson" },
  });
  if (!res.ok) {
    throw new Error(`Lichess import failed: ${res.status}`);
  }
  const text = await res.text();
  let imported = 0;
  let skipped = 0;
  for (const line of text.split("\n")) {
    if (!line.trim() || imported >= maxGames) break;
    const game = JSON.parse(line) as {
      id: string;
      pgn?: string;
      players: {
        white: { user?: { name: string }; rating?: number };
        black: { user?: { name: string }; rating?: number };
      };
      winner?: string;
      opening?: { eco?: string; name?: string };
      speed?: string;
      createdAt?: number;
    };
    const pgn = game.pgn;
    if (!pgn) continue;
    const whiteName = game.players.white.user?.name ?? "Anonymous";
    const blackName = game.players.black.user?.name ?? "Anonymous";
    const isWhite = whiteName.toLowerCase() === username.toLowerCase();
    const isBlack = blackName.toLowerCase() === username.toLowerCase();
    if (!isWhite && !isBlack) continue;
    const headers = extractHeaders(pgn);
    const eco = game.opening?.eco ?? headers.eco ?? null;
    const openingName =
      game.opening?.name ??
      headers.opening ??
      openingLabel(null, eco ?? null, pgn);
    const result =
      game.winner === "white"
        ? isWhite
          ? "win"
          : "loss"
        : game.winner === "black"
          ? isBlack
            ? "win"
            : "loss"
          : "draw";
    const playedAt = game.createdAt
      ? new Date(game.createdAt).toISOString()
      : null;
    const inserted = await db.upsertGame({
      source: "lichess",
      external_id: game.id,
      pgn,
      white_player: whiteName,
      black_player: blackName,
      white_elo: game.players.white.rating ?? null,
      black_elo: game.players.black.rating ?? null,
      result,
      eco,
      opening_name: openingName === "Unknown" ? null : openingName,
      time_class: game.speed ?? null,
      played_at: playedAt,
      is_own_game: options.isOwnGame,
      own_color: isWhite ? "white" : "black",
      analyzed_at: null,
      avg_cp_loss: null,
      position_evals_json: null,
    });
    if (inserted) imported++;
    else skipped++;
  }
  return {
    imported,
    skipped,
    source: "lichess",
    message: `Imported ${imported} ${options.isOwnGame ? "of your" : "opponent"} games from Lichess (${username})`,
  };
}

export async function importChesscom(
  username: string,
  maxGames: number,
  options: ImportOptions = OWN,
): Promise<ImportResult> {
  const archivesRes = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
  );
  if (!archivesRes.ok) {
    throw new Error(`Chess.com user not found or unavailable (${archivesRes.status})`);
  }
  const archivesData = (await archivesRes.json()) as { archives: string[] };
  let imported = 0;
  let skipped = 0;
  const archives = [...archivesData.archives].reverse();
  for (const archiveUrl of archives) {
    if (imported >= maxGames) break;
    await new Promise((r) => setTimeout(r, 300));
    const monthRes = await fetch(archiveUrl);
    if (!monthRes.ok) continue;
    const month = (await monthRes.json()) as {
      games: Array<{
        url: string;
        pgn: string;
        time_class?: string;
        end_time?: number;
        eco?: string;
        white: { username: string; rating?: number; result: string };
        black: { username: string; rating?: number; result: string };
      }>;
    };
    const games = [...month.games].reverse();
    for (const game of games) {
      if (imported >= maxGames) break;
      if (game.time_class === "bullet") continue;
      const { result, ownColor } = normalizeChesscomResult(
        game.white.result,
        game.black.result,
        username,
        game.white.username,
      );
      const headers = extractHeaders(game.pgn);
      const eco = game.eco ?? headers.eco ?? null;
      const openingName = openingLabel(headers.opening, eco, game.pgn);
      const externalId = game.url.split("/").pop() ?? game.url;
      const playedAt = game.end_time
        ? new Date(game.end_time * 1000).toISOString()
        : null;
      const inserted = await db.upsertGame({
        source: "chesscom",
        external_id: externalId,
        pgn: game.pgn,
        white_player: game.white.username,
        black_player: game.black.username,
        white_elo: game.white.rating ?? null,
        black_elo: game.black.rating ?? null,
        result,
        eco,
        opening_name: openingName === "Unknown" ? null : openingName,
        time_class: game.time_class ?? null,
        played_at: playedAt,
        is_own_game: options.isOwnGame,
        own_color: ownColor,
        analyzed_at: null,
        avg_cp_loss: null,
        position_evals_json: null,
      });
      if (inserted) imported++;
      else skipped++;
    }
  }
  return {
    imported,
    skipped,
    source: "chesscom",
    message: `Imported ${imported} ${options.isOwnGame ? "of your" : "opponent"} games from Chess.com (${username})`,
  };
}

export function importOpponentLichess(username: string, maxGames: number) {
  return importLichess(username, maxGames, OPPONENT);
}

export function importOpponentChesscom(username: string, maxGames: number) {
  return importChesscom(username, maxGames, OPPONENT);
}
