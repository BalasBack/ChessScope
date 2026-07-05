use crate::db::Database;
use crate::import::pgn_meta;
use crate::models::ImportResult;
use serde::Deserialize;
use std::time::Duration;

const BASE: &str = "https://api.chess.com/pub";

#[derive(Debug, Deserialize)]
struct ArchivesResponse {
    archives: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct MonthGames {
    games: Vec<ChessComGame>,
}

#[derive(Debug, Deserialize)]
struct ChessComGame {
    url: String,
    pgn: String,
    time_class: Option<String>,
    end_time: Option<i64>,
    eco: Option<String>,
    white: PlayerSide,
    black: PlayerSide,
}

#[derive(Debug, Deserialize)]
struct PlayerSide {
    username: String,
    rating: Option<i32>,
    result: String,
}

pub async fn import_games(
    db: &Database,
    username: &str,
    max_games: u32,
) -> Result<ImportResult, String> {
    let client = reqwest::Client::builder()
        .user_agent("ChessScope/0.1 (tournament prep app)")
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let archives_url = format!("{BASE}/player/{username}/games/archives");
    let archives: ArchivesResponse = client
        .get(&archives_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch archives: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid archives response: {e}"))?;

    let mut imported = 0u32;
    let mut skipped = 0u32;
    let mut archives_list = archives.archives;
    archives_list.reverse();

    for archive_url in archives_list {
        if imported >= max_games {
            break;
        }
        tokio::time::sleep(Duration::from_millis(1100)).await;

        let month: MonthGames = client
            .get(&archive_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch {archive_url}: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Invalid month games: {e}"))?;

        let mut games = month.games;
        games.reverse();

        for game in games {
            if imported >= max_games {
                break;
            }
            let time_class = game.time_class.as_deref();
            if let Some(tc) = time_class {
                if tc == "bullet" {
                    continue;
                }
            }

            let external_id = game.url.rsplit('/').next().unwrap_or(&game.url).to_string();
            let (result, is_white) = normalize_result(&game.white, &game.black, username);
            let own_color = if is_white { "white" } else { "black" };
            let played_at = game
                .end_time
                .map(|t| chrono::DateTime::from_timestamp(t, 0))
                .flatten()
                .map(|dt| dt.to_rfc3339());

            let (eco, opening_name) = pgn_meta::resolve_opening(
                game.eco.as_deref(),
                None,
                &game.pgn,
            );
            let inserted = db
                .upsert_game(
                    "chesscom",
                    &external_id,
                    &game.pgn,
                    &game.white.username,
                    &game.black.username,
                    game.white.rating,
                    game.black.rating,
                    &result,
                    eco.as_deref(),
                    opening_name.as_deref(),
                    time_class,
                    played_at.as_deref(),
                    is_white || game.black.username.eq_ignore_ascii_case(username),
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
        source: "chesscom".to_string(),
        message: format!("Imported {imported} games from Chess.com ({username})"),
    })
}

fn normalize_result(white: &PlayerSide, black: &PlayerSide, username: &str) -> (String, bool) {
    let is_white = white.username.eq_ignore_ascii_case(username);
    let own_result = if is_white {
        &white.result
    } else {
        &black.result
    };
    let normalized = match own_result.as_str() {
        "win" => "win",
        "checkmated" | "timeout" | "resigned" | "lose" | "abandoned" => "loss",
        "agreed" | "repetition" | "stalemate" | "timevsinsufficient" | "insufficient" | "50move"
        | "draw" => "draw",
        _ => own_result.as_str(),
    };
    (normalized.to_string(), is_white)
}
