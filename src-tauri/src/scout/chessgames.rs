use crate::models::OpponentCandidate;
use regex::Regex;
use std::sync::LazyLock;
use std::time::Duration;

static PLAYER_LINK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"chessplayer\?pid=(\d+)"#).unwrap());
static GAME_LINK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"chessgame\?gid=(\d+)"#).unwrap());

pub struct ChessGamesGame {
    pub game_id: String,
    pub pgn: String,
    pub white: String,
    pub black: String,
    pub result: String,
    pub date: Option<String>,
}

pub async fn search_players(query: &str) -> Result<Vec<OpponentCandidate>, String> {
    let client = http_client()?;
    let url = format!(
        "https://www.chessgames.com/perl/chess.pl?search={}",
        urlencoding::encode(query)
    );

    tokio::time::sleep(Duration::from_millis(1100)).await;

    let html = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("ChessGames search failed: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for cap in PLAYER_LINK.captures_iter(&html) {
        let pid = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        if pid.is_empty() || !seen.insert(pid.to_string()) {
            continue;
        }
        let name = extract_player_name(&html, pid).unwrap_or_else(|| query.to_string());
        results.push(OpponentCandidate {
            id: format!("cg_{pid}"),
            name,
            source: "chessgames".to_string(),
            rating: None,
            federation: None,
            fide_id: None,
            uscf_id: None,
            chessgames_id: Some(pid.to_string()),
            chesscom_username: None,
            lichess_username: None,
        });
        if results.len() >= 8 {
            break;
        }
    }
    Ok(results)
}

pub async fn fetch_recent_games(player_id: &str, max: u32) -> Result<Vec<ChessGamesGame>, String> {
    let client = http_client()?;
    let url = format!("https://www.chessgames.com/perl/chessplayer?pid={player_id}");

    tokio::time::sleep(Duration::from_millis(1100)).await;

    let html = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("ChessGames profile failed: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let mut game_ids = Vec::new();
    for cap in GAME_LINK.captures_iter(&html) {
        if let Some(id) = cap.get(1).map(|m| m.as_str().to_string()) {
            game_ids.push(id);
        }
        if game_ids.len() as u32 >= max {
            break;
        }
    }

    let mut games = Vec::new();
    for gid in game_ids {
        tokio::time::sleep(Duration::from_millis(1100)).await;
        if let Ok(game) = fetch_game_pgn(&client, &gid).await {
            games.push(game);
        }
    }
    Ok(games)
}

async fn fetch_game_pgn(
    client: &reqwest::Client,
    game_id: &str,
) -> Result<ChessGamesGame, String> {
    let url = format!("https://www.chessgames.com/perl/chessgame?gid={game_id}");
    let html = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = html.text().await.map_err(|e| e.to_string())?;

    let pgn = extract_pgn(&text).ok_or("No PGN found")?;
    let white = extract_tag(&pgn, "White").unwrap_or_else(|| "Unknown".to_string());
    let black = extract_tag(&pgn, "Black").unwrap_or_else(|| "Unknown".to_string());
    let result = extract_tag(&pgn, "Result").unwrap_or_else(|| "*".to_string());
    let date = extract_tag(&pgn, "Date");

    Ok(ChessGamesGame {
        game_id: game_id.to_string(),
        pgn,
        white,
        black,
        result,
        date,
    })
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ChessScope/0.1")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

fn extract_player_name(html: &str, pid: &str) -> Option<String> {
    let pattern = format!(r#"chessplayer\?pid={pid}[^>]*>([^<]+)<"#);
    let re = Regex::new(&pattern).ok()?;
    re.captures(html)
        .and_then(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
}

fn extract_pgn(html: &str) -> Option<String> {
    let start = html.find("[Event ")?; 
    let end = html[start..].find("</pre>").unwrap_or(html.len() - start);
    Some(html[start..start + end].trim().to_string())
}

fn extract_tag(pgn: &str, tag: &str) -> Option<String> {
    let re = Regex::new(&format!(r#"\[{tag}\s+"([^"]+)"\]"#)).ok()?;
    re.captures(pgn)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
}
