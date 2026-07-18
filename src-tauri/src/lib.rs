mod analysis;
mod coach;
mod commands;
mod db;
mod import;
mod models;
mod scout;

use commands::AppState;
use db::Database;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = Database::open().expect("Failed to open database");
    let state = Mutex::new(AppState { db });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::import_chesscom_games,
            commands::import_lichess_games,
            commands::list_games,
            commands::get_game_count,
            commands::get_scouted_game_count,
            commands::get_player_stats,
            commands::lookup_uscf_member,
            commands::check_ollama_status,
            commands::coach_chat,
            commands::sync_all_accounts,
            commands::check_stockfish_status,
            commands::get_game_analysis,
            commands::analyze_game,
            commands::analyze_pending_games,
            commands::get_analysis_summary,
            commands::get_blunder_puzzles,
            commands::submit_puzzle_attempt,
            commands::search_opponents,
            commands::build_opponent_dossier,
            commands::backfill_openings,
            commands::repair_scout_games,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
