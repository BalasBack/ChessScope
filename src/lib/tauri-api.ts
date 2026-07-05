import { invoke } from "@tauri-apps/api/core";
import type { ChessScopeApi } from "./types";

export const tauriApi: ChessScopeApi = {
  getSettings: () => invoke("get_settings"),
  saveSettings: (settings) => invoke("save_settings", { settings }),
  importChesscom: (username, maxGames) =>
    invoke("import_chesscom_games", { username, maxGames: maxGames ?? null }),
  importLichess: (username, maxGames) =>
    invoke("import_lichess_games", { username, maxGames: maxGames ?? null }),
  syncAll: () => invoke("sync_all_accounts"),
  listGames: (limit, offset) =>
    invoke("list_games", { limit: limit ?? null, offset: offset ?? null }),
  getGameCount: () => invoke("get_game_count"),
  getPlayerStats: () => invoke("get_player_stats"),
  lookupUscf: (uscfId) => invoke("lookup_uscf_member", { uscfId }),
  checkOllama: () => invoke("check_ollama_status"),
  coachChat: (model, messages) => invoke("coach_chat", { model, messages }),
  checkStockfish: () => invoke("check_stockfish_status"),
  getGameAnalysis: (gameId) => invoke("get_game_analysis", { gameId }),
  analyzeGame: (gameId) => invoke("analyze_game", { gameId }),
  analyzePendingGames: (limit) =>
    invoke("analyze_pending_games", { limit: limit ?? null }),
  getAnalysisSummary: () => invoke("get_analysis_summary"),
  getBlunderPuzzles: (limit) =>
    invoke("get_blunder_puzzles", { limit: limit ?? null }),
  submitPuzzleAttempt: (puzzleId, solved, timeSecs) =>
    invoke("submit_puzzle_attempt", { puzzleId, solved, timeSecs }),
  backfillOpenings: () => invoke("backfill_openings"),
  searchOpponents: (query, sources) =>
    invoke("search_opponents", { query, sources: sources ?? null }),
  buildOpponentDossier: (candidate) =>
    invoke("build_opponent_dossier", { candidate }),
};
