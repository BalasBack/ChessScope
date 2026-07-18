use crate::db::Database;
use crate::import;
use crate::models::{
    AccountSettings, AnalysisSummary, BlunderPuzzle, CoachMessage, GameAnalysis, GameRecord,
    ImportResult, OllamaStatus, OpponentCandidate, OpponentDossier, PlayerStatsSummary,
    RepairScoutResult, StockfishStatus, UscfMember,
};
use crate::scout;
use std::sync::Mutex;
use tauri::{AppHandle, State};

pub struct AppState {
    pub db: Database,
}

fn with_db<F, T>(state: &State<'_, Mutex<AppState>>, f: F) -> Result<T, String>
where
    F: FnOnce(&Database) -> Result<T, String>,
{
    let guard = state.lock().map_err(|e| e.to_string())?;
    f(&guard.db)
}

#[tauri::command]
pub fn get_settings(state: State<'_, Mutex<AppState>>) -> Result<AccountSettings, String> {
    with_db(&state, |db| db.get_settings().map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn save_settings(
    settings: AccountSettings,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    with_db(&state, |db| db.save_settings(&settings).map_err(|e| e.to_string()))
}

#[tauri::command]
pub async fn import_chesscom_games(
    username: String,
    max_games: Option<u32>,
    _state: State<'_, Mutex<AppState>>,
) -> Result<ImportResult, String> {
    let max = max_games.unwrap_or(100);
    let db = Database::open().map_err(|e| e.to_string())?;
    let result = import::import_chesscom(&db, &username, max).await?;
    Ok(result)
}

#[tauri::command]
pub async fn import_lichess_games(
    username: String,
    max_games: Option<u32>,
    _state: State<'_, Mutex<AppState>>,
) -> Result<ImportResult, String> {
    let max = max_games.unwrap_or(100);
    let db = Database::open().map_err(|e| e.to_string())?;
    let result = import::import_lichess(&db, &username, max).await?;
    Ok(result)
}

#[tauri::command]
pub fn list_games(
    limit: Option<u32>,
    offset: Option<u32>,
    own_only: Option<bool>,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<GameRecord>, String> {
    with_db(&state, |db| {
        db.list_games(limit.unwrap_or(50), offset.unwrap_or(0), own_only)
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn get_game_count(state: State<'_, Mutex<AppState>>) -> Result<u32, String> {
    with_db(&state, |db| db.count_games().map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn get_scouted_game_count(state: State<'_, Mutex<AppState>>) -> Result<u32, String> {
    with_db(&state, |db| db.count_scouted_games().map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn get_player_stats(state: State<'_, Mutex<AppState>>) -> Result<PlayerStatsSummary, String> {
    with_db(&state, |db| db.player_stats().map_err(|e| e.to_string()))
}

#[tauri::command]
pub async fn lookup_uscf_member(
    uscf_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<UscfMember, String> {
    let member = import::lookup_uscf(&uscf_id).await?;
    if let Ok(guard) = state.lock() {
        let _ = guard.db.save_uscf_profile(&member);
    }
    Ok(member)
}

#[tauri::command]
pub async fn check_ollama_status() -> Result<OllamaStatus, String> {
    Ok(crate::coach::check_status().await)
}

#[tauri::command]
pub async fn coach_chat(
    model: String,
    messages: Vec<CoachMessage>,
    state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
    let profile_summary = with_db(&state, |db| {
        db.player_stats()
            .map(|s| serde_json::to_string_pretty(&s).unwrap_or_default())
            .map_err(|e| e.to_string())
    })?;
    crate::coach::chat(&model, &messages, &profile_summary).await
}

#[tauri::command]
pub async fn sync_all_accounts(
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<ImportResult>, String> {
    let settings = with_db(&state, |db| {
        db.get_settings().map_err(|e| e.to_string())
    })?;
    let max = settings.default_game_count.unwrap_or(100);
    let db = Database::open().map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    if let Some(ref username) = settings.chesscom_username {
        if !username.is_empty() {
            results.push(import::import_chesscom(&db, username, max).await?);
        }
    }
    if let Some(ref username) = settings.lichess_username {
        if !username.is_empty() {
            results.push(import::import_lichess(&db, username, max).await?);
        }
    }

    if results.is_empty() {
        return Err("No Chess.com or Lichess username configured in Settings".to_string());
    }
    let _ = state.lock().map_err(|e| e.to_string())?.db.backfill_openings();
    Ok(results)
}

#[tauri::command]
pub fn check_stockfish_status() -> StockfishStatus {
    match crate::analysis::resolve_stockfish_path() {
        Ok(path) => StockfishStatus {
            available: true,
            path: Some(path),
            error: None,
        },
        Err(e) => StockfishStatus {
            available: false,
            path: None,
            error: Some(e),
        },
    }
}

#[tauri::command]
pub fn get_game_analysis(
    game_id: i64,
    state: State<'_, Mutex<AppState>>,
) -> Result<Option<GameAnalysis>, String> {
    with_db(&state, |db| db.get_game_analysis(game_id).map_err(|e| e.to_string()))
}

#[tauri::command]
pub async fn analyze_game(
    game_id: i64,
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<GameAnalysis, String> {
    let depth = with_db(&state, |db| {
        Ok(db
            .get_settings()
            .map_err(|e| e.to_string())?
            .analysis_depth
            .unwrap_or(14))
    })?;
    let db = Database::open().map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || crate::analysis::analyze_game(&db, game_id, depth, Some(&app)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn analyze_pending_games(
    limit: Option<u32>,
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<u32, String> {
    let depth = with_db(&state, |db| {
        Ok(db
            .get_settings()
            .map_err(|e| e.to_string())?
            .analysis_depth
            .unwrap_or(14))
    })?;
    let max = limit.unwrap_or(5);
    let db = Database::open().map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        crate::analysis::analyze_pending(&db, max, depth, Some(&app))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_analysis_summary(
    state: State<'_, Mutex<AppState>>,
) -> Result<AnalysisSummary, String> {
    with_db(&state, |db| db.analysis_summary().map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn get_blunder_puzzles(
    limit: Option<u32>,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<BlunderPuzzle>, String> {
    with_db(&state, |db| {
        db.get_blunder_puzzles(limit.unwrap_or(10))
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn submit_puzzle_attempt(
    puzzle_id: String,
    solved: bool,
    time_secs: u32,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    with_db(&state, |db| {
        db.record_puzzle_attempt(&puzzle_id, solved, time_secs)
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub async fn search_opponents(
    query: String,
    sources: Option<Vec<String>>,
) -> Result<Vec<OpponentCandidate>, String> {
    scout::search_opponents(&query, sources).await
}

#[tauri::command]
pub async fn build_opponent_dossier(
    candidate: OpponentCandidate,
) -> Result<OpponentDossier, String> {
    let db = Database::open().map_err(|e| e.to_string())?;
    scout::build_dossier(&db, &candidate).await
}

#[tauri::command]
pub fn backfill_openings(state: State<'_, Mutex<AppState>>) -> Result<u32, String> {
    with_db(&state, |db| db.backfill_openings().map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn repair_scout_games(state: State<'_, Mutex<AppState>>) -> Result<RepairScoutResult, String> {
    with_db(&state, |db| db.repair_scout_games().map_err(|e| e.to_string()))
}
