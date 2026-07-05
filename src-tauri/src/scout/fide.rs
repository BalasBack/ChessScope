use crate::models::OpponentCandidate;
use regex::Regex;
use std::sync::LazyLock;
use std::time::Duration;

static ROW_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?is)<td[^>]*data-label="FIDEID"[^>]*>\s*(\d+)\s*</td>\s*<td[^>]*data-label="Name"[^>]*>\s*<a[^>]*>([^<]+)</a>"#,
    )
    .unwrap()
});

static FED_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)alt="([A-Z]{3})">([A-Z]{3})"#).unwrap()
});

static STD_RATING_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?is)<td[^>]*data-label="FIDEID"[^>]*>\s*(\d+)\s*</td>.*?<td[^>]*data-label="Rtg"[^>]*>\s*(\d+)\s*</td>"#,
    )
    .unwrap()
});

pub async fn search_players(query: &str) -> Result<Vec<OpponentCandidate>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) ChessScope/0.1")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "https://ratings.fide.com/incl_search_l.php?search={}&searchoption=name",
        urlencoding::encode(query)
    );

    let html = client
        .get(&url)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Referer", "https://ratings.fide.com/")
        .send()
        .await
        .map_err(|e| format!("FIDE search failed: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    if html.contains("No results found") {
        return Ok(vec![]);
    }

    let mut results = Vec::new();
    for cap in ROW_RE.captures_iter(&html) {
        let fide_id = cap.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
        let name = cap
            .get(2)
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_default();
        if name.is_empty() {
            continue;
        }

        let rating = STD_RATING_RE
            .captures(&cap[0])
            .and_then(|c| c.get(2)?.as_str().parse().ok());

        let federation = FED_RE
            .captures(&cap[0])
            .and_then(|c| c.get(2).map(|m| m.as_str().to_string()));

        results.push(OpponentCandidate {
            id: format!("fide_{fide_id}"),
            name,
            source: "fide".to_string(),
            rating,
            federation,
            fide_id: Some(fide_id),
            uscf_id: None,
            chessgames_id: None,
            chesscom_username: None,
            lichess_username: None,
        });
        if results.len() >= 12 {
            break;
        }
    }
    Ok(results)
}
