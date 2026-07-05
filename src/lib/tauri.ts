import { invoke } from "@tauri-apps/api/core";

export interface AccountSettings {
  chesscom_username: string | null;
  lichess_username: string | null;
  uscf_id: string | null;
  ollama_model: string | null;
  analysis_depth: number | null;
  default_game_count: number | null;
}

export interface GameRecord {
  id: number;
  source: string;
  external_id: string;
  pgn: string;
  white_player: string;
  black_player: string;
  white_elo: number | null;
  black_elo: number | null;
  result: string;
  eco: string | null;
  opening_name: string | null;
  time_class: string | null;
  played_at: string | null;
  is_own_game: boolean;
  analyzed?: boolean;
  avg_cp_loss?: number | null;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  source: string;
  message: string;
}

export interface OpeningStat {
  eco: string;
  name: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  color: string;
}

export interface PlayerStatsSummary {
  total_games: number;
  wins: number;
  draws: number;
  losses: number;
  openings_as_white: OpeningStat[];
  openings_as_black: OpeningStat[];
  by_time_class: {
    time_class: string;
    games: number;
    wins: number;
    draws: number;
    losses: number;
  }[];
}

export interface UscfRating {
  rating_system: string;
  rating: number | null;
  games_played: number | null;
  is_provisional: boolean;
}

export interface UscfMember {
  id: string;
  first_name: string;
  last_name: string;
  state: string | null;
  fide_id: string | null;
  status: string | null;
  ratings: UscfRating[];
}

export interface CoachMessage {
  role: string;
  content: string;
}

export interface OllamaStatus {
  connected: boolean;
  models: string[];
  error: string | null;
}

export interface MoveAnalysis {
  move_index: number;
  san: string;
  fen: string;
  eval_cp: number | null;
  best_move_uci: string | null;
  classification: string;
  cp_loss: number;
  is_own_move: boolean;
}

export interface GameAnalysis {
  game_id: number;
  moves: MoveAnalysis[];
  /** Absolute eval per board index: 0 = start, k = after k moves. */
  position_evals: (number | null)[];
  avg_cp_loss: number;
  analyzed: boolean;
}

export interface AnalysisProgress {
  game_id: number;
  current: number;
  total: number;
  message: string;
}

export interface AnalysisSummary {
  analyzed_games: number;
  total_blunders: number;
  total_mistakes: number;
  total_inaccuracies: number;
  avg_cp_loss: number;
}

export interface BlunderPuzzle {
  id: string;
  game_id: number;
  move_index: number;
  fen: string;
  best_move_uci: string;
  played_move: string;
  cp_loss: number;
  white_player: string;
  black_player: string;
  opening_name: string | null;
}

export interface StockfishStatus {
  available: boolean;
  path: string | null;
  error: string | null;
}

export interface OpponentCandidate {
  id: string;
  name: string;
  source: string;
  rating: number | null;
  federation: string | null;
  fide_id: string | null;
  uscf_id: string | null;
  chessgames_id: string | null;
  chesscom_username: string | null;
  lichess_username: string | null;
}

export interface DossierColorRecord {
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface DossierRecord {
  wins: number;
  draws: number;
  losses: number;
  as_white: DossierColorRecord;
  as_black: DossierColorRecord;
}

export interface DossierOpeningStat {
  name: string;
  eco: string | null;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  color: string;
}

export interface DossierRecentGame {
  opponent: string;
  result: string;
  opening: string;
  eco: string | null;
  color: string;
  date: string | null;
  source: string;
  time_class: string | null;
}

export interface DossierRatingLine {
  label: string;
  rating: number;
  source: string;
}

export interface OpponentDossier {
  candidate: OpponentCandidate;
  games_imported: number;
  games_imported_chesscom: number;
  games_imported_lichess: number;
  games_imported_chessgames: number;
  opening_lines: string[];
  openings_as_white: DossierOpeningStat[];
  openings_as_black: DossierOpeningStat[];
  record: DossierRecord;
  recent_games: DossierRecentGame[];
  ratings: DossierRatingLine[];
  style_summary: string;
  tactical_notes: string;
  recommended_prep: string;
  ai_insight: string | null;
}

export const api = {
  getSettings: () => invoke<AccountSettings>("get_settings"),
  saveSettings: (settings: AccountSettings) =>
    invoke<void>("save_settings", { settings }),
  importChesscom: (username: string, maxGames?: number) =>
    invoke<ImportResult>("import_chesscom_games", {
      username,
      maxGames: maxGames ?? null,
    }),
  importLichess: (username: string, maxGames?: number) =>
    invoke<ImportResult>("import_lichess_games", {
      username,
      maxGames: maxGames ?? null,
    }),
  syncAll: () => invoke<ImportResult[]>("sync_all_accounts"),
  listGames: (limit?: number, offset?: number) =>
    invoke<GameRecord[]>("list_games", {
      limit: limit ?? null,
      offset: offset ?? null,
    }),
  getGameCount: () => invoke<number>("get_game_count"),
  getPlayerStats: () => invoke<PlayerStatsSummary>("get_player_stats"),
  lookupUscf: (uscfId: string) =>
    invoke<UscfMember>("lookup_uscf_member", { uscfId }),
  checkOllama: () => invoke<OllamaStatus>("check_ollama_status"),
  coachChat: (model: string, messages: CoachMessage[]) =>
    invoke<string>("coach_chat", { model, messages }),
  checkStockfish: () => invoke<StockfishStatus>("check_stockfish_status"),
  getGameAnalysis: (gameId: number) =>
    invoke<GameAnalysis | null>("get_game_analysis", { gameId }),
  analyzeGame: (gameId: number) =>
    invoke<GameAnalysis>("analyze_game", { gameId }),
  analyzePendingGames: (limit?: number) =>
    invoke<number>("analyze_pending_games", { limit: limit ?? null }),
  getAnalysisSummary: () => invoke<AnalysisSummary>("get_analysis_summary"),
  getBlunderPuzzles: (limit?: number) =>
    invoke<BlunderPuzzle[]>("get_blunder_puzzles", { limit: limit ?? null }),
  submitPuzzleAttempt: (puzzleId: string, solved: boolean, timeSecs: number) =>
    invoke<void>("submit_puzzle_attempt", {
      puzzleId,
      solved,
      timeSecs,
    }),
  backfillOpenings: () => invoke<number>("backfill_openings"),
  searchOpponents: (query: string, sources?: string[]) =>
    invoke<OpponentCandidate[]>("search_opponents", { query, sources: sources ?? null }),
  buildOpponentDossier: (candidate: OpponentCandidate) =>
    invoke<OpponentDossier>("build_opponent_dossier", { candidate }),
};
