use crate::models::{UscfMember, UscfRating};
use serde::Deserialize;
use std::time::Duration;

const BASE: &str = "https://ratings-api.uschess.org/api/v1/members";

#[derive(Debug, Deserialize)]
struct ApiMember {
    id: String,
    #[serde(rename = "firstName")]
    first_name: String,
    #[serde(rename = "lastName")]
    last_name: String,
    #[serde(rename = "stateRep")]
    state_rep: Option<String>,
    #[serde(rename = "fideId")]
    fide_id: Option<String>,
    status: Option<String>,
    ratings: Vec<ApiRating>,
}

#[derive(Debug, Deserialize)]
struct ApiRating {
    #[serde(rename = "ratingSystem")]
    rating_system: String,
    rating: Option<i32>,
    #[serde(rename = "gamesPlayed")]
    games_played: Option<i32>,
    #[serde(rename = "isProvisional")]
    is_provisional: bool,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    items: Vec<ApiMember>,
}

pub async fn search_members(query: &str, limit: u32) -> Result<Vec<UscfMember>, String> {
    let (first, last) = parse_name_query(query);
    let client = reqwest::Client::builder()
        .user_agent("ChessScope/0.1 (tournament prep app)")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();

    let mut merge = |members: Vec<UscfMember>| {
        for m in members {
            if seen.insert(m.id.clone()) {
                out.push(m);
            }
        }
    };

    match (first.as_ref(), last.as_ref()) {
        (Some(f), Some(l)) if f == l => {
            merge(fetch_members(&client, None, Some(l), limit).await?);
            merge(fetch_members(&client, Some(f), None, limit).await?);
        }
        _ => {
            merge(
                fetch_members(
                    &client,
                    first.as_deref(),
                    last.as_deref(),
                    limit,
                )
                .await?,
            );
        }
    }

    out.truncate(limit as usize);
    Ok(out)
}

async fn fetch_members(
    client: &reqwest::Client,
    first: Option<&str>,
    last: Option<&str>,
    limit: u32,
) -> Result<Vec<UscfMember>, String> {
    let mut url = format!("{BASE}?pageSize={limit}");
    if let Some(l) = last {
        url.push_str(&format!("&lastName={}", urlencoding::encode(l)));
    }
    if let Some(f) = first {
        url.push_str(&format!("&firstName={}", urlencoding::encode(f)));
    }

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("USCF search failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("USCF search error: {}", response.status()));
    }

    let data: SearchResponse = response
        .json()
        .await
        .map_err(|e| format!("Invalid USCF search response: {e}"))?;

    Ok(data.items.into_iter().map(api_member_to_model).collect())
}

fn parse_name_query(query: &str) -> (Option<String>, Option<String>) {
    let q = query.trim();
    if q.is_empty() {
        return (None, None);
    }
    if q.contains(',') {
        let parts: Vec<&str> = q.splitn(2, ',').map(|s| s.trim()).collect();
        return (
            parts.get(1).filter(|s| !s.is_empty()).map(|s| s.to_string()),
            parts.first().filter(|s| !s.is_empty()).map(|s| s.to_string()),
        );
    }
    let parts: Vec<&str> = q.split_whitespace().collect();
    match parts.len() {
        1 => (Some(parts[0].to_string()), Some(parts[0].to_string())),
        _ => (
            Some(parts[0].to_string()),
            Some(parts[1..].join(" ")),
        ),
    }
}

fn api_member_to_model(api: ApiMember) -> UscfMember {
    UscfMember {
        id: api.id,
        first_name: api.first_name,
        last_name: api.last_name,
        state: api.state_rep,
        fide_id: api.fide_id,
        status: api.status,
        ratings: api
            .ratings
            .into_iter()
            .map(|r| UscfRating {
                rating_system: r.rating_system,
                rating: r.rating,
                games_played: r.games_played,
                is_provisional: r.is_provisional,
            })
            .collect(),
    }
}

pub async fn lookup_member(uscf_id: &str) -> Result<UscfMember, String> {
    let client = reqwest::Client::builder()
        .user_agent("ChessScope/0.1 (tournament prep app)")
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{BASE}/{uscf_id}");
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("USCF lookup failed: {e}"))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(format!("No USCF member found with ID {uscf_id}"));
    }
    if !response.status().is_success() {
        return Err(format!("USCF API error: {}", response.status()));
    }

    let api: ApiMember = response
        .json()
        .await
        .map_err(|e| format!("Invalid USCF response: {e}"))?;

    Ok(api_member_to_model(api))
}
