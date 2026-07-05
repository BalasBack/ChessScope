use crate::models::OpponentCandidate;
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct AutocompleteResponse {
    result: Vec<AutocompleteUser>,
}

#[derive(Debug, Deserialize)]
struct AutocompleteUser {
    #[serde(default)]
    name: String,
    id: String,
    #[serde(default)]
    title: Option<String>,
}

pub async fn search_players(query: &str) -> Result<Vec<OpponentCandidate>, String> {
    let client = http_client()?;
    let url = format!(
        "https://lichess.org/api/player/autocomplete?term={}&object=1&friend=0",
        urlencoding::encode(query)
    );

    let response: AutocompleteResponse = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Lichess search failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid Lichess response: {e}"))?;

    let mut results = Vec::new();
    for user in response.result {
        if user.id.is_empty() {
            continue;
        }
        let display = if user.name.is_empty() {
            user.id.clone()
        } else {
            user.name
        };
        results.push(OpponentCandidate {
            id: format!("lichess_{}", user.id),
            name: display,
            source: "lichess".to_string(),
            rating: None,
            federation: user.title,
            fide_id: None,
            uscf_id: None,
            chessgames_id: None,
            chesscom_username: None,
            lichess_username: Some(user.id),
        });
        if results.len() >= 10 {
            break;
        }
    }
    Ok(results)
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("ChessScope/0.1 (tournament prep)")
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())
}
