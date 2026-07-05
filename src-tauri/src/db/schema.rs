use rusqlite::{Connection, Result as SqlResult};

pub fn run_migrations(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            external_id TEXT NOT NULL,
            pgn TEXT NOT NULL,
            white_player TEXT NOT NULL,
            black_player TEXT NOT NULL,
            white_elo INTEGER,
            black_elo INTEGER,
            result TEXT NOT NULL,
            eco TEXT,
            opening_name TEXT,
            time_class TEXT,
            played_at TEXT,
            is_own_game INTEGER NOT NULL DEFAULT 1,
            own_color TEXT,
            analyzed_at TEXT,
            avg_cp_loss REAL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(source, external_id)
        );

        CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at);
        CREATE INDEX IF NOT EXISTS idx_games_own ON games(is_own_game);

        CREATE TABLE IF NOT EXISTS analysis_moves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER NOT NULL,
            move_index INTEGER NOT NULL,
            san TEXT NOT NULL,
            fen TEXT NOT NULL,
            eval_cp INTEGER,
            best_move_uci TEXT,
            classification TEXT NOT NULL,
            cp_loss INTEGER NOT NULL DEFAULT 0,
            is_own_move INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
            UNIQUE(game_id, move_index)
        );

        CREATE INDEX IF NOT EXISTS idx_analysis_game ON analysis_moves(game_id);
        CREATE INDEX IF NOT EXISTS idx_analysis_class ON analysis_moves(classification);

        CREATE TABLE IF NOT EXISTS uscf_profiles (
            uscf_id TEXT PRIMARY KEY,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            state TEXT,
            fide_id TEXT,
            status TEXT,
            ratings_json TEXT,
            synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS opponents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            uscf_id TEXT,
            fide_id TEXT,
            chesscom_username TEXT,
            lichess_username TEXT,
            chessgames_id TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS opponent_dossiers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            opponent_id INTEGER NOT NULL,
            summary_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (opponent_id) REFERENCES opponents(id)
        );

        CREATE TABLE IF NOT EXISTS training_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_type TEXT NOT NULL,
            score REAL,
            total INTEGER,
            duration_secs INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS puzzle_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            puzzle_id TEXT NOT NULL,
            solved INTEGER NOT NULL,
            time_secs INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        ",
    )?;

    // Safe migrations for existing DBs
    let _ = conn.execute("ALTER TABLE games ADD COLUMN analyzed_at TEXT", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN avg_cp_loss REAL", []);
    let _ = conn.execute(
        "ALTER TABLE games ADD COLUMN position_evals_json TEXT",
        [],
    );

    Ok(())
}
