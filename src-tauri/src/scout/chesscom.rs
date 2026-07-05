use crate::models::OpponentCandidate;
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct ChessComProfile {
    username: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    country: Option<String>,
}

pub async fn search_players(query: &str) -> Result<Vec<OpponentCandidate>, String> {
    let client = http_client()?;
    let mut results = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for username in username_variants(query) {
        if !seen.insert(username.to_lowercase()) {
            continue;
        }
        if let Ok(profile) = lookup_player(&client, &username).await {
            results.push(profile);
        }
        if results.len() >= 8 {
            break;
        }
    }
    Ok(results)
}

async fn lookup_player(
    client: &reqwest::Client,
    username: &str,
) -> Result<OpponentCandidate, String> {
    let url = format!("https://api.chess.com/pub/player/{username}");
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err("not found".to_string());
    }
    let profile: ChessComProfile = response.json().await.map_err(|e| e.to_string())?;

    let name = profile
        .name
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| profile.username.clone());

    Ok(OpponentCandidate {
        id: format!("chesscom_{}", profile.username),
        name,
        source: "chesscom".to_string(),
        rating: None,
        federation: profile.country,
        fide_id: None,
        uscf_id: None,
        chessgames_id: None,
        chesscom_username: Some(profile.username),
        lichess_username: None,
    })
}

fn capitalize(word: &str) -> String {
    let mut c = word.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

fn username_variants(query: &str) -> Vec<String> {
    let trimmed = query.trim();
    let mut out = Vec::new();
    if trimmed.is_empty() {
        return out;
    }

    out.push(trimmed.to_string());
    out.push(trimmed.to_lowercase());

    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.len() >= 2 {
        let title_joined: String = parts.iter().map(|p| capitalize(p)).collect();
        out.push(title_joined.clone());
        out.push(title_joined.to_lowercase());
        out.push(parts.iter().copied().collect::<String>());
        out.push(parts.iter().copied().collect::<String>().to_lowercase());
    } else if parts.len() == 1 {
        out.push(capitalize(parts[0]));
    }

    out.sort();
    out.dedup();
    out
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("ChessScope/0.1 (tournament prep)")
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())
}
