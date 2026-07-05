use crate::db::Database;
use crate::import::pgn_meta;
use crate::models::ImportResult;
use futures_util::StreamExt;
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct LichessGame {
    id: String,
    pgn: Option<String>,
    players: LichessPlayers,
    winner: Option<String>,
    opening: Option<LichessOpening>,
    speed: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct LichessPlayers {
    white: LichessPlayer,
    black: LichessPlayer,
}

#[derive(Debug, Deserialize)]
struct LichessPlayer {
    user: Option<LichessUser>,
    rating: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct LichessUser {
    name: String,
}

#[derive(Debug, Deserialize)]
struct LichessOpening {
    eco: Option<String>,
    name: Option<String>,
}

pub async fn import_games(
    db: &Database,
    username: &str,
    max_games: u32,
) -> Result<ImportResult, String> {
    let client = reqwest::Client::builder()
        .user_agent("ChessScope/0.1 (tournament prep app)")
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://lichess.org/api/games/user/{username}");
    let response = client
        .get(&url)
        .header("Accept", "application/x-ndjson")
        .query(&[
            ("max", max_games.to_string()),
            ("clocks", "true".to_string()),
            ("opening", "true".to_string()),
            ("perfType", "rapid,blitz,classical".to_string()),
            ("rated", "true".to_string()),
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Lichess games: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Lichess API error: {}", response.status()));
    }

    let mut imported = 0u32;
    let mut skipped = 0u32;
    let mut stream = response.bytes_stream();

    let mut buffer = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find('\n') {
            let line: String = buffer.drain(..=pos).collect();
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if imported >= max_games {
                break;
            }

            let game: LichessGame = match serde_json::from_str(line) {
                Ok(g) => g,
                Err(_) => continue,
            };

            let pgn = match game.pgn {
                Some(p) if !p.is_empty() => p,
                _ => continue,
            };

            let white_name = game
                .players
                .white
                .user
                .as_ref()
                .map(|u| u.name.clone())
                .unwrap_or_else(|| "Anonymous".to_string());
            let black_name = game
                .players
                .black
                .user
                .as_ref()
                .map(|u| u.name.clone())
                .unwrap_or_else(|| "Anonymous".to_string());

            let is_white = white_name.eq_ignore_ascii_case(username);
            let is_black = black_name.eq_ignore_ascii_case(username);
            let own_color = if is_white {
                "white"
            } else if is_black {
                "black"
            } else {
                "white"
            };
            let result = match game.winner.as_deref() {
                Some("white") if is_white => "win",
                Some("black") if is_black => "win",
                Some("white") if is_black => "loss",
                Some("black") if is_white => "loss",
                _ => "draw",
            };

            let played_at = game
                .created_at
                .and_then(|t| chrono::DateTime::from_timestamp_millis(t))
                .map(|dt| dt.to_rfc3339());

            let headers = pgn_meta::extract_headers(&pgn);
            let (eco, opening_name) = pgn_meta::resolve_opening(
                game.opening.as_ref().and_then(|o| o.eco.as_deref()),
                game.opening.as_ref().and_then(|o| o.name.as_deref()),
                &pgn,
            );
            let eco = eco.or(headers.eco);
            let opening_name = opening_name.or(headers.opening);

            let inserted = db
                .upsert_game(
                    "lichess",
                    &game.id,
                    &pgn,
                    &white_name,
                    &black_name,
                    game.players.white.rating,
                    game.players.black.rating,
                    result,
                    eco.as_deref(),
                    opening_name.as_deref(),
                    game.speed.as_deref(),
                    played_at.as_deref(),
                    is_white || is_black,
                    Some(own_color),
                )
                .map_err(|e| e.to_string())?;

            if inserted {
                imported += 1;
            } else {
                skipped += 1;
            }
        }
    }

    Ok(ImportResult {
        imported,
        skipped,
        source: "lichess".to_string(),
        message: format!("Imported {imported} games from Lichess ({username})"),
    })
}
