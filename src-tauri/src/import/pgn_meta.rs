use regex::Regex;
use std::sync::LazyLock;

static HEADER_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)\[(\w+)\s+"([^"]*)"\]"#).unwrap()
});

#[derive(Debug, Clone, Default)]
pub struct PgnHeaders {
    pub eco: Option<String>,
    pub opening: Option<String>,
}

static ECO_CODE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-E]\d{2}(?:-\d+)?$").unwrap());

pub fn is_eco_code(value: &str) -> bool {
    ECO_CODE_RE.is_match(value.trim())
}

pub fn is_move_line(value: &str) -> bool {
    let v = value.trim();
    v.starts_with('1') && v.contains('.')
}

pub fn sanitize_opening_label(value: &str) -> Option<String> {
    let v = value.trim();
    if v.is_empty()
        || v.eq_ignore_ascii_case("unknown")
        || is_eco_code(v)
        || is_move_line(v)
    {
        return None;
    }
    if v.starts_with("http://") || v.starts_with("https://") {
        let slug = v.rsplit('/').next().unwrap_or("").trim();
        if slug.is_empty() || slug == "opening" {
            return None;
        }
        return Some(title_case_words(&slug.replace('_', " ")));
    }
    Some(v.to_string())
}

fn title_case_words(s: &str) -> String {
    s.split_whitespace()
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                None => String::new(),
                Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn extract_headers(pgn: &str) -> PgnHeaders {
    let mut headers = PgnHeaders::default();
    for line in pgn.lines() {
        let line = line.trim();
        if !line.starts_with('[') {
            if line.is_empty() {
                continue;
            }
            break;
        }
        if let Some(caps) = HEADER_RE.captures(line) {
            let key = caps.get(1).map(|m| m.as_str().to_lowercase());
            let value = caps.get(2).map(|m| m.as_str().to_string());
            match (key.as_deref(), value) {
                (Some("eco"), Some(v))
                    if !v.is_empty() && !v.starts_with("http://") && !v.starts_with("https://") =>
                {
                    headers.eco = Some(v);
                }
                (Some("opening"), Some(v)) if !v.is_empty() => {
                    headers.opening = sanitize_opening_label(&v);
                }
                _ => {}
            }
        }
    }
    headers
}

pub fn opening_line_from_pgn(pgn: &str) -> Option<String> {
    if let Ok(moves) = crate::analysis::pgn::parse_pgn_moves(pgn) {
        if moves.len() >= 2 {
            let mut out = String::new();
            for (i, m) in moves.iter().take(6).enumerate() {
                if i % 2 == 0 {
                    out.push_str(&format!("{}.", i / 2 + 1));
                }
                out.push_str(&m.san);
                out.push(' ');
            }
            return Some(out.trim().to_string());
        }
    }
    None
}

pub fn resolve_opening(
    eco: Option<&str>,
    opening_name: Option<&str>,
    pgn: &str,
) -> (Option<String>, Option<String>) {
    let headers = extract_headers(pgn);
    let eco = eco
        .filter(|s| !s.is_empty() && !s.starts_with("http"))
        .map(|s| s.to_string())
        .or(headers.eco);
    let opening = opening_name
        .and_then(|s| sanitize_opening_label(s))
        .or(headers.opening)
        .or_else(|| eco.as_deref().and_then(eco_to_name).map(str::to_string));
    (eco, opening)
}

/// Common ECO codes → human-readable names (Chess.com often stores ECO only).
pub fn eco_to_name(eco: &str) -> Option<&'static str> {
    match eco.to_uppercase().as_str() {
        "A00" => Some("Irregular Opening"),
        "A40" => Some("Queen's Pawn Game"),
        "A50" => Some("Queen's Pawn Game"),
        "B00" => Some("King's Pawn Game"),
        "B01" => Some("Scandinavian Defense"),
        "B06" => Some("Modern Defense"),
        "B07" => Some("Pirc Defense"),
        "B10" => Some("Caro-Kann Defense"),
        "B20" => Some("Sicilian Defense"),
        "B21" => Some("Sicilian Defense, Grand Prix Attack"),
        "B22" => Some("Sicilian Defense, Alapin Variation"),
        "B23" => Some("Sicilian Defense, Closed"),
        "B30" => Some("Sicilian Defense"),
        "B40" => Some("Sicilian Defense"),
        "B50" => Some("Sicilian Defense"),
        "B90" => Some("Sicilian Defense, Najdorf Variation"),
        "C00" => Some("French Defense"),
        "C10" => Some("French Defense"),
        "C20" => Some("King's Pawn Game"),
        "C30" => Some("King's Gambit"),
        "C40" => Some("King's Knight Opening"),
        "C41" => Some("Philidor Defense"),
        "C42" => Some("Petrov Defense"),
        "C44" => Some("King's Knight Opening"),
        "C45" => Some("Scotch Game"),
        "C46" => Some("Three Knights Game"),
        "C47" => Some("Four Knights Game"),
        "C50" => Some("Italian Game"),
        "C55" => Some("Two Knights Defense"),
        "C60" => Some("Ruy Lopez"),
        "C65" => Some("Ruy Lopez, Berlin Defense"),
        "D00" => Some("Queen's Pawn Game"),
        "D02" => Some("Queen's Pawn Game"),
        "D06" => Some("Queen's Gambit"),
        "D10" => Some("Queen's Gambit Declined"),
        "D20" => Some("Queen's Gambit Accepted"),
        "D30" => Some("Queen's Gambit Declined"),
        "D40" => Some("Queen's Gambit Declined, Semi-Tarrasch"),
        "D50" => Some("Queen's Gambit Declined"),
        "E00" => Some("Catalan Opening"),
        "E04" => Some("Catalan Opening"),
        "E10" => Some("Queen's Pawn Game"),
        "E15" => Some("Queen's Indian Defense"),
        "E20" => Some("Nimzo-Indian Defense"),
        "E32" => Some("Nimzo-Indian Defense"),
        "E60" => Some("King's Indian Defense"),
        "E70" => Some("King's Indian Defense"),
        _ => None,
    }
}
