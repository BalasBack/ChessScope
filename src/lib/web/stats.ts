import { openingDisplay } from "../chess";
import type {
  AnalysisSummary,
  BlunderPuzzle,
  OpeningStat,
  PlayerStatsSummary,
} from "../types";
import * as db from "./db";

export async function getPlayerStats(): Promise<PlayerStatsSummary> {
  const games = (await db.allStoredGames()).filter((g) => g.is_own_game);
  let wins = 0;
  let draws = 0;
  let losses = 0;
  const whiteOpenings = new Map<
    string,
    { eco: string; name: string; games: number; wins: number; draws: number; losses: number }
  >();
  const blackOpenings = new Map<
    string,
    { eco: string; name: string; games: number; wins: number; draws: number; losses: number }
  >();
  const timeClass = new Map<
    string,
    { games: number; wins: number; draws: number; losses: number }
  >();

  for (const g of games) {
    if (g.result === "win") wins++;
    else if (g.result === "draw") draws++;
    else losses++;

    const color = g.own_color ?? "white";
    const eco = g.eco ?? "???";
    const { name } = openingDisplay(g.opening_name, g.eco, g.pgn);
    const key = eco;
    const map = color === "white" ? whiteOpenings : blackOpenings;
    const entry = map.get(key) ?? {
      eco,
      name,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
    };
    entry.games++;
    if (g.result === "win") entry.wins++;
    else if (g.result === "draw") entry.draws++;
    else entry.losses++;
    map.set(key, entry);

    const tc = g.time_class ?? "unknown";
    const t = timeClass.get(tc) ?? { games: 0, wins: 0, draws: 0, losses: 0 };
    t.games++;
    if (g.result === "win") t.wins++;
    else if (g.result === "draw") t.draws++;
    else t.losses++;
    timeClass.set(tc, t);
  }

  const toStats = (
    map: Map<
      string,
      { eco: string; name: string; games: number; wins: number; draws: number; losses: number }
    >,
    color: string,
  ): OpeningStat[] =>
    [...map.values()]
      .sort((a, b) => b.games - a.games)
      .slice(0, 10)
      .map((o) => ({ ...o, color }));

  return {
    total_games: games.length,
    wins,
    draws,
    losses,
    openings_as_white: toStats(whiteOpenings, "white"),
    openings_as_black: toStats(blackOpenings, "black"),
    by_time_class: [...timeClass.entries()]
      .map(([time_class, s]) => ({ time_class, ...s }))
      .sort((a, b) => b.games - a.games),
  };
}

export async function getAnalysisSummary(): Promise<AnalysisSummary> {
  const games = await db.allStoredGames();
  const analyzed = games.filter((g) => g.is_own_game && g.analyzed_at);
  let blunders = 0;
  let mistakes = 0;
  let inaccuracies = 0;
  let cpSum = 0;

  for (const g of analyzed) {
    cpSum += g.avg_cp_loss ?? 0;
    const a = await db.getAnalysis(g.id);
    if (!a) continue;
    for (const m of a.moves) {
      if (!m.is_own_move) continue;
      if (m.classification === "blunder") blunders++;
      else if (m.classification === "mistake") mistakes++;
      else if (m.classification === "inaccuracy") inaccuracies++;
    }
  }

  return {
    analyzed_games: analyzed.length,
    total_blunders: blunders,
    total_mistakes: mistakes,
    total_inaccuracies: inaccuracies,
    avg_cp_loss: analyzed.length ? cpSum / analyzed.length : 0,
  };
}

export async function getBlunderPuzzles(limit = 20): Promise<BlunderPuzzle[]> {
  const games = await db.allStoredGames();
  const puzzles: BlunderPuzzle[] = [];

  for (const g of games) {
    if (!g.analyzed_at) continue;
    const a = await db.getAnalysis(g.id);
    if (!a) continue;
    for (const m of a.moves) {
      if (m.classification !== "blunder" || !m.is_own_move || !m.best_move_uci)
        continue;
      const id = `${g.id}_${m.move_index}`;
      if (await db.isPuzzleSolved(id)) continue;
      puzzles.push({
        id,
        game_id: g.id,
        move_index: m.move_index,
        fen: m.fen,
        best_move_uci: m.best_move_uci,
        played_move: m.san,
        cp_loss: m.cp_loss,
        white_player: g.white_player,
        black_player: g.black_player,
        opening_name: g.opening_name,
      });
    }
  }
  puzzles.sort(() => Math.random() - 0.5);
  return puzzles.slice(0, limit);
}

export async function backfillOpenings(): Promise<number> {
  return 0;
}
