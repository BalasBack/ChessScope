pub mod engine;
pub mod pgn;

pub use engine::resolve_stockfish_path;

use crate::db::Database;
use crate::models::{AnalysisProgress, GameAnalysis, MoveAnalysis};
use engine::{cp_loss_for_move, StockfishEngine};
use pgn::{classify_move, parse_pgn_moves};
use shakmaty::{fen::Fen, Chess, Position};
use tauri::{AppHandle, Emitter};

pub fn analyze_game(
    db: &Database,
    game_id: i64,
    depth: u32,
    app: Option<&AppHandle>,
) -> Result<GameAnalysis, String> {
    let game = db.get_game(game_id).map_err(|e| e.to_string())?;
    let own_color = db
        .get_own_color(game_id)
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "white".to_string());

    let parsed = parse_pgn_moves(&game.pgn)?;
    if parsed.is_empty() {
        return Err("No moves to analyze".to_string());
    }

    let mut engine = StockfishEngine::launch()?;
    let mut move_analyses = Vec::new();
    let mut position_evals: Vec<Option<i32>> = Vec::new();
    let mut own_cp_losses = Vec::new();
    let total = parsed.len();

    for (idx, mv) in parsed.iter().enumerate() {
        if let Some(handle) = app {
            let _ = handle.emit(
                "analysis-progress",
                AnalysisProgress {
                    game_id,
                    current: (idx + 1) as u32,
                    total: total as u32,
                    message: format!("Analyzing move {} / {}: {}", idx + 1, total, mv.san),
                },
            );
        }

        let fen: Chess = Fen::from_ascii(mv.fen_before.as_bytes())
            .map_err(|e| format!("Bad FEN: {e}"))?
            .into_position(shakmaty::CastlingMode::Standard)
            .map_err(|e| format!("Bad position: {e}"))?;
        let white_to_move = fen.turn() == shakmaty::Color::White;
        let is_own_move = (own_color == "white" && white_to_move)
            || (own_color == "black" && !white_to_move);

        let before = engine.evaluate_fen(&mv.fen_before, depth)?;
        let position_eval = engine::to_white_perspective(&before, white_to_move);
        position_evals.push(Some(position_eval));

        let played_after =
            engine.evaluate_with_moves(&mv.fen_before, &[mv.uci.clone()], depth)?;
        let after_eval = engine::to_white_perspective(&played_after, !white_to_move);

        if idx == parsed.len() - 1 {
            position_evals.push(Some(after_eval));
        }

        let best_after = if let Some(ref best_uci) = before.best_move_uci {
            if best_uci == &mv.uci {
                played_after.clone()
            } else {
                engine.evaluate_with_moves(&mv.fen_before, &[best_uci.clone()], depth)?
            }
        } else {
            played_after.clone()
        };

        let cp_loss = if is_own_move {
            cp_loss_for_move(&best_after, &played_after, white_to_move)
        } else {
            0
        };

        if is_own_move {
            own_cp_losses.push(cp_loss);
        }

        let classification = if is_own_move {
            classify_move(cp_loss).to_string()
        } else {
            "opponent".to_string()
        };

        move_analyses.push(MoveAnalysis {
            move_index: idx as u32,
            san: mv.san.clone(),
            fen: mv.fen_before.clone(),
            eval_cp: Some(position_eval),
            best_move_uci: before.best_move_uci.clone(),
            classification,
            cp_loss,
            is_own_move,
        });
    }

    let avg_cp_loss = if own_cp_losses.is_empty() {
        0.0
    } else {
        own_cp_losses.iter().sum::<i32>() as f64 / own_cp_losses.len() as f64
    };

    db.save_game_analysis(game_id, &move_analyses, &position_evals, avg_cp_loss)
        .map_err(|e| e.to_string())?;

    Ok(GameAnalysis {
        game_id,
        moves: move_analyses,
        position_evals,
        avg_cp_loss,
        analyzed: true,
    })
}

pub fn analyze_pending(
    db: &Database,
    limit: u32,
    depth: u32,
    app: Option<&AppHandle>,
) -> Result<u32, String> {
    let ids = db
        .get_unanalyzed_game_ids(limit)
        .map_err(|e| e.to_string())?;
    let mut count = 0u32;
    for id in ids {
        analyze_game(db, id, depth, app)?;
        count += 1;
    }
    Ok(count)
}
