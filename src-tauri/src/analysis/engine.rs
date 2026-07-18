use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

pub struct StockfishEngine {
    process: Child,
    reader: BufReader<std::process::ChildStdout>,
}

#[derive(Debug, Clone)]
pub struct EngineEval {
    pub eval_cp: i32,
    pub best_move_uci: Option<String>,
    pub mate_in: Option<i32>,
}

impl StockfishEngine {
    pub fn launch() -> Result<Self, String> {
        let path = resolve_stockfish_path()?;
        let mut process = Command::new(&path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to start Stockfish at {path}: {e}"))?;

        let stdout = process.stdout.take().ok_or("No stdout")?;
        let mut engine = Self {
            process,
            reader: BufReader::new(stdout),
        };
        engine.send("uci")?;
        engine.wait_for("uciok", 5000)?;
        engine.send("isready")?;
        engine.wait_for("readyok", 5000)?;
        Ok(engine)
    }

    pub fn evaluate_fen(&mut self, fen: &str, depth: u32) -> Result<EngineEval, String> {
        self.send(&format!("position fen {fen}"))?;
        self.send(&format!("go depth {depth}"))?;
        self.parse_go_result(depth)
    }

    pub fn evaluate_with_moves(
        &mut self,
        fen: &str,
        moves: &[String],
        depth: u32,
    ) -> Result<EngineEval, String> {
        let moves_str = moves.join(" ");
        self.send(&format!("position fen {fen} moves {moves_str}"))?;
        self.send(&format!("go depth {depth}"))?;
        self.parse_go_result(depth)
    }

    fn parse_go_result(&mut self, depth: u32) -> Result<EngineEval, String> {
        let timeout = Duration::from_secs(30 + depth as u64);
        let start = std::time::Instant::now();
        let mut eval_cp = 0i32;
        let mut mate_in = None;
        let mut best_move = None;

        loop {
            if start.elapsed() > timeout {
                return Err("Stockfish timeout".to_string());
            }
            let line = self.read_line()?;
            if line.starts_with("info ") && line.contains(" score ") {
                if let Some(cp) = parse_score_cp(&line) {
                    eval_cp = cp;
                }
                if let Some(mate) = parse_score_mate(&line) {
                    mate_in = Some(mate);
                }
            }
            if line.starts_with("bestmove ") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 && parts[1] != "(none)" {
                    best_move = Some(parts[1].to_string());
                }
                break;
            }
        }

        Ok(EngineEval {
            eval_cp: eval_cp_with_mate(eval_cp, mate_in),
            best_move_uci: best_move,
            mate_in,
        })
    }

    fn send(&mut self, cmd: &str) -> Result<(), String> {
        let stdin = self
            .process
            .stdin
            .as_mut()
            .ok_or("stdin unavailable")?;
        writeln!(stdin, "{cmd}").map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())
    }

    fn read_line(&mut self) -> Result<String, String> {
        let mut line = String::new();
        self.reader
            .read_line(&mut line)
            .map_err(|e| e.to_string())?;
        Ok(line.trim().to_string())
    }

    fn wait_for(&mut self, needle: &str, timeout_ms: u64) -> Result<(), String> {
        let start = std::time::Instant::now();
        loop {
            if start.elapsed() > Duration::from_millis(timeout_ms) {
                return Err(format!("Timeout waiting for {needle}"));
            }
            let line = self.read_line()?;
            if line.contains(needle) {
                return Ok(());
            }
        }
    }
}

impl Drop for StockfishEngine {
    fn drop(&mut self) {
        let _ = self.send("quit");
        let _ = self.process.wait();
    }
}

fn parse_score_cp(line: &str) -> Option<i32> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    for (i, part) in parts.iter().enumerate() {
        if *part == "score" && parts.get(i + 1) == Some(&"cp") {
            return parts.get(i + 2)?.parse().ok();
        }
    }
    None
}

fn parse_score_mate(line: &str) -> Option<i32> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    for (i, part) in parts.iter().enumerate() {
        if *part == "score" && parts.get(i + 1) == Some(&"mate") {
            return parts.get(i + 2)?.parse().ok();
        }
    }
    None
}

/// Encode mate scores as large centipawn values from White's perspective.
pub fn to_white_perspective(eval: &EngineEval, white_to_move: bool) -> i32 {
    if let Some(mate) = eval.mate_in {
        let sign = if mate > 0 { 1 } else { -1 };
        let plies = mate.unsigned_abs().min(90) as i32;
        let cp = sign * (10_000 - plies * 100);
        return if white_to_move { cp } else { -cp };
    }
    if white_to_move {
        eval.eval_cp
    } else {
        -eval.eval_cp
    }
}

/// Legacy helper — prefer `to_white_perspective` with the correct side to move.
pub fn eval_cp_with_mate(eval_cp: i32, mate_in: Option<i32>) -> i32 {
    if let Some(mate) = mate_in {
        let sign = if mate > 0 { 1 } else { -1 };
        let plies = mate.unsigned_abs().min(90) as i32;
        return sign * (10_000 - plies * 100);
    }
    eval_cp
}

pub fn is_mate_score(cp: i32) -> bool {
    cp.abs() >= 5000
}

pub fn resolve_stockfish_path() -> Result<String, String> {
    let mut candidates: Vec<PathBuf> = vec![
        PathBuf::from("binaries/stockfish.exe"),
        PathBuf::from("src-tauri/binaries/stockfish.exe"),
        dirs::data_dir()
            .unwrap_or_default()
            .join("ChessScope")
            .join("stockfish.exe"),
    ];

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("src-tauri").join("binaries").join("stockfish.exe"));
        candidates.push(cwd.join("binaries").join("stockfish.exe"));
    }

    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        while let Some(d) = dir {
            candidates.push(d.join("stockfish.exe"));
            candidates.push(d.join("binaries").join("stockfish.exe"));
            candidates.push(
                d.join("src-tauri")
                    .join("binaries")
                    .join("stockfish.exe"),
            );
            dir = d.parent().map(|p| p.to_path_buf());
        }
    }

    for c in &candidates {
        if c.exists() {
            return Ok(c.to_string_lossy().to_string());
        }
    }

    // PATH lookup
    for name in ["stockfish.exe", "stockfish"] {
        if let Ok(path) = which_simple(name) {
            return Ok(path);
        }
    }

    Err(
        "Stockfish not found. Download from https://stockfishchess.org/download/ \
         and place stockfish.exe in src-tauri/binaries/ or install to PATH."
            .to_string(),
    )
}

fn which_simple(name: &str) -> Result<String, ()> {
    let path_var = std::env::var_os("PATH").ok_or(())?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(name);
        if candidate.exists() {
            return Ok(candidate.to_string_lossy().to_string());
        }
    }
    Err(())
}

pub fn cp_loss_for_move(
    best_after: &EngineEval,
    played_after: &EngineEval,
    moving_player_is_white: bool,
) -> i32 {
    let after_white_to_move = !moving_player_is_white;
    let best = player_perspective_cp(best_after, after_white_to_move, moving_player_is_white);
    let played = player_perspective_cp(played_after, after_white_to_move, moving_player_is_white);
    (best - played).max(0)
}

fn player_perspective_cp(
    eval: &EngineEval,
    side_to_move_is_white: bool,
    for_white_player: bool,
) -> i32 {
    let white_cp = to_white_perspective(eval, side_to_move_is_white);
    if for_white_player {
        white_cp
    } else {
        -white_cp
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cp_loss_detects_white_blunder_from_black_to_move_position() {
        // After white blunders: black to move, engine says +5.0 for black (played) vs +2.0 (best)
        let best = EngineEval {
            eval_cp: 200,
            best_move_uci: None,
            mate_in: None,
        };
        let played = EngineEval {
            eval_cp: 500,
            best_move_uci: None,
            mate_in: None,
        };
        let loss = cp_loss_for_move(&best, &played, true);
        assert_eq!(loss, 300, "white blunder should cost ~3 pawns");
    }

    #[test]
    fn cp_loss_zero_when_best_move_played() {
        let eval = EngineEval {
            eval_cp: 150,
            best_move_uci: None,
            mate_in: None,
        };
        assert_eq!(cp_loss_for_move(&eval, &eval, false), 0);
    }
}
