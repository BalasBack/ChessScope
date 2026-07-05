use crate::coach;
use crate::db::Database;
use crate::import::pgn_meta;
use crate::models::{
    DossierColorRecord, DossierOpeningStat, DossierRatingLine, DossierRecentGame, DossierRecord,
    OpponentCandidate, OpponentDossier,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::time::Duration;

const MAX_ONLINE_GAMES: u32 = 30;
const MAX_CHESSGAMES: u32 = 10;
const AI_INSIGHT_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Default)]
struct GameSample {
    opponent: String,
    result: String,
    opening: String,
    eco: Option<String>,
    color: String,
    date: Option<String>,
    source: String,
    time_class: Option<String>,
}

#[derive(Debug, Default)]
struct Collector {
    samples: Vec<GameSample>,
    openings_white: HashMap<String, (Option<String>, u32, u32, u32, u32)>,
    openings_black: HashMap<String, (Option<String>, u32, u32, u32, u32)>,
    record_white: (u32, u32, u32),
    record_black: (u32, u32, u32),
}

impl Collector {
    fn add_game(
        &mut self,
        opponent_name: &str,
        white: &str,
        black: &str,
        result_pgn: &str,
        eco: Option<String>,
        opening: Option<String>,
        color: &str,
        date: Option<String>,
        source: &str,
        time_class: Option<String>,
    ) {
        let opp_is_white = color == "white";
        let opponent = if opp_is_white {
            white.to_string()
        } else {
            black.to_string()
        };

        let result = result_for_player(result_pgn, opp_is_white);
        let opening_name = opening
            .or_else(|| eco.as_deref().and_then(pgn_meta::eco_to_name).map(str::to_string))
            .unwrap_or_else(|| "Unknown".to_string());

        self.samples.push(GameSample {
            opponent: if opponent.eq_ignore_ascii_case(opponent_name) {
                opponent.clone()
            } else {
                opponent
            },
            result: result.clone(),
            opening: opening_name.clone(),
            eco: eco.clone(),
            color: color.to_string(),
            date,
            source: source.to_string(),
            time_class,
        });

        let map = if color == "white" {
            &mut self.openings_white
        } else {
            &mut self.openings_black
        };
        let entry = map
            .entry(opening_name.clone())
            .or_insert((eco.clone(), 0, 0, 0, 0));
        entry.1 += 1;
        match result.as_str() {
            "win" => entry.2 += 1,
            "draw" => entry.3 += 1,
            _ => entry.4 += 1,
        }

        let rec = if color == "white" {
            &mut self.record_white
        } else {
            &mut self.record_black
        };
        match result.as_str() {
            "win" => rec.0 += 1,
            "draw" => rec.1 += 1,
            _ => rec.2 += 1,
        }
    }

    fn opening_stats(
        map: &HashMap<String, (Option<String>, u32, u32, u32, u32)>,
        color: &str,
    ) -> Vec<DossierOpeningStat> {
        let mut stats: Vec<DossierOpeningStat> = map
            .iter()
            .map(|(name, (eco, games, wins, draws, losses))| DossierOpeningStat {
                name: name.clone(),
                eco: eco.clone(),
                games: *games,
                wins: *wins,
                draws: *draws,
                losses: *losses,
                color: color.to_string(),
            })
            .collect();
        stats.sort_by(|a, b| b.games.cmp(&a.games));
        stats.truncate(8);
        stats
    }

    fn record(&self) -> DossierRecord {
        let (ww, wd, wl) = self.record_white;
        let (bw, bd, bl) = self.record_black;
        DossierRecord {
            wins: ww + bw,
            draws: wd + bd,
            losses: wl + bl,
            as_white: DossierColorRecord {
                games: ww + wd + wl,
                wins: ww,
                draws: wd,
                losses: wl,
            },
            as_black: DossierColorRecord {
                games: bw + bd + bl,
                wins: bw,
                draws: bd,
                losses: bl,
            },
        }
    }

    fn recent_games(&self) -> Vec<DossierRecentGame> {
        self.samples
            .iter()
            .take(12)
            .map(|g| DossierRecentGame {
                opponent: g.opponent.clone(),
                result: g.result.clone(),
                opening: g.opening.clone(),
                eco: g.eco.clone(),
                color: g.color.clone(),
                date: g.date.clone(),
                source: g.source.clone(),
                time_class: g.time_class.clone(),
            })
            .collect()
    }

    fn top_opening_names(&self) -> Vec<String> {
        let mut counts: HashMap<String, u32> = HashMap::new();
        for map in [&self.openings_white, &self.openings_black] {
            for (name, (_, games, _, _, _)) in map {
                *counts.entry(name.clone()).or_insert(0) += games;
            }
        }
        let mut sorted: Vec<_> = counts.into_iter().collect();
        sorted.sort_by(|a, b| b.1.cmp(&a.1));
        sorted.into_iter().take(8).map(|(n, _)| n).collect()
    }
}

pub async fn build(db: &Database, candidate: &OpponentCandidate) -> Result<OpponentDossier, String> {
    let mut collector = Collector::default();
    let mut games_chesscom = 0u32;
    let mut games_lichess = 0u32;
    let mut games_chessgames = 0u32;
    let opponent_key = candidate.name.clone();

    let mut ratings = fetch_ratings(candidate).await;

    if let Some(ref username) = candidate.chesscom_username {
        games_chesscom = import_chesscom_games(db, username, &opponent_key, &mut collector).await;
    }

    if let Some(ref username) = candidate.lichess_username {
        games_lichess = import_lichess_games(db, username, &opponent_key, &mut collector).await;
    }

    if let Some(ref cg_id) = candidate.chessgames_id {
        games_chessgames = match tokio::time::timeout(
            Duration::from_secs(25),
            import_chessgames(db, cg_id, &opponent_key, &mut collector),
        )
        .await
        {
            Ok(n) => n,
            Err(_) => 0,
        };
    }

    if ratings.is_empty() {
        if let Some(r) = candidate.rating {
            ratings.push(DossierRatingLine {
                label: "Standard".to_string(),
                rating: r,
                source: candidate.source.clone(),
            });
        }
    }

    let openings_white = Collector::opening_stats(&collector.openings_white, "white");
    let openings_black = Collector::opening_stats(&collector.openings_black, "black");
    let opening_lines = collector.top_opening_names();
    let record = collector.record();
    let recent_games = collector.recent_games();
    let games_imported = games_chesscom + games_lichess + games_chessgames;

    let style_summary = build_style_summary(candidate, &record, &openings_white, &openings_black, &ratings);
    let tactical_notes = build_tactical_notes(&record, &openings_white, &openings_black);
    let recommended_prep = build_recommended_prep(candidate, &opening_lines, &record, &ratings);

    let ai_insight = tokio::time::timeout(
        AI_INSIGHT_TIMEOUT,
        try_ai_insight(
            db,
            candidate,
            &style_summary,
            &opening_lines,
            &record,
            &ratings,
        ),
    )
    .await
    .ok()
    .flatten();

    Ok(OpponentDossier {
        candidate: candidate.clone(),
        games_imported,
        games_imported_chesscom: games_chesscom,
        games_imported_lichess: games_lichess,
        games_imported_chessgames: games_chessgames,
        opening_lines,
        openings_as_white: openings_white,
        openings_as_black: openings_black,
        record,
        recent_games,
        ratings,
        style_summary,
        tactical_notes,
        recommended_prep,
        ai_insight,
    })
}

async fn fetch_ratings(candidate: &OpponentCandidate) -> Vec<DossierRatingLine> {
    let mut lines = Vec::new();

    if let Some(ref uscf_id) = candidate.uscf_id {
        if let Ok(member) = crate::import::uscf::lookup_member(uscf_id).await {
            for r in &member.ratings {
                if let Some(rating) = r.rating {
                    lines.push(DossierRatingLine {
                        label: format_uscf_system(&r.rating_system),
                        rating,
                        source: "USCF".to_string(),
                    });
                }
            }
        }
    }

    if let Some(ref username) = candidate.chesscom_username {
        if let Ok(mut cc) = fetch_chesscom_ratings(username).await {
            lines.append(&mut cc);
        }
    }

    if let Some(ref username) = candidate.lichess_username {
        if let Ok(mut lic) = fetch_lichess_ratings(username).await {
            lines.append(&mut lic);
        }
    }

    if lines.is_empty() {
        if let Some(r) = candidate.rating {
            let label = match candidate.source.as_str() {
                "fide" => "FIDE Standard",
                _ => "Rating",
            };
            lines.push(DossierRatingLine {
                label: label.to_string(),
                rating: r,
                source: candidate.source.to_uppercase(),
            });
        }
    }

    lines
}

fn format_uscf_system(system: &str) -> String {
    system
        .replace("OverTheBoard", "OTB ")
        .replace("Online", "Online ")
        .replace("Regular", "Regular")
        .replace("Quick", "Quick")
        .replace("Blitz", "Blitz")
}

async fn fetch_chesscom_ratings(username: &str) -> Result<Vec<DossierRatingLine>, String> {
    let client = http_client()?;
    let url = format!("https://api.chess.com/pub/player/{username}/stats");
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Ok(vec![]);
    }
    let stats: ChessComStats = response.json().await.map_err(|e| e.to_string())?;
    let mut lines = Vec::new();
    push_cc_rating(&mut lines, "Rapid", &stats.chess_rapid);
    push_cc_rating(&mut lines, "Blitz", &stats.chess_blitz);
    push_cc_rating(&mut lines, "Bullet", &stats.chess_bullet);
    push_cc_rating(&mut lines, "Daily", &stats.chess_daily);
    Ok(lines)
}

fn push_cc_rating(lines: &mut Vec<DossierRatingLine>, label: &str, bucket: &Option<ChessComPerf>) {
    if let Some(p) = bucket {
        if let Some(r) = p.last.as_ref().and_then(|l| l.rating) {
            lines.push(DossierRatingLine {
                label: label.to_string(),
                rating: r,
                source: "Chess.com".to_string(),
            });
        }
    }
}

#[derive(Debug, Deserialize)]
struct ChessComStats {
    chess_rapid: Option<ChessComPerf>,
    chess_blitz: Option<ChessComPerf>,
    chess_bullet: Option<ChessComPerf>,
    chess_daily: Option<ChessComPerf>,
}

#[derive(Debug, Deserialize)]
struct ChessComPerf {
    last: Option<ChessComLast>,
}

#[derive(Debug, Deserialize)]
struct ChessComLast {
    rating: Option<i32>,
}

async fn fetch_lichess_ratings(username: &str) -> Result<Vec<DossierRatingLine>, String> {
    let client = http_client()?;
    let url = format!("https://lichess.org/api/user/{username}");
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Ok(vec![]);
    }
    let user: LichessUserProfile = response.json().await.map_err(|e| e.to_string())?;
    let mut lines = Vec::new();
    push_lichess_rating(&mut lines, "Rapid", user.perfs.get("rapid"));
    push_lichess_rating(&mut lines, "Blitz", user.perfs.get("blitz"));
    push_lichess_rating(&mut lines, "Classical", user.perfs.get("classical"));
    push_lichess_rating(&mut lines, "Bullet", user.perfs.get("bullet"));
    Ok(lines)
}

fn push_lichess_rating(lines: &mut Vec<DossierRatingLine>, label: &str, perf: Option<&LichessPerf>) {
    if let Some(p) = perf {
        if p.games.unwrap_or(0) > 0 {
            lines.push(DossierRatingLine {
                label: label.to_string(),
                rating: p.rating.unwrap_or(0),
                source: "Lichess".to_string(),
            });
        }
    }
}

#[derive(Debug, Deserialize)]
struct LichessUserProfile {
    #[serde(default)]
    perfs: HashMap<String, LichessPerf>,
}

#[derive(Debug, Deserialize)]
struct LichessPerf {
    games: Option<u32>,
    rating: Option<i32>,
}

async fn import_chesscom_games(
    db: &Database,
    username: &str,
    opponent_name: &str,
    collector: &mut Collector,
) -> u32 {
    let client = match http_client() {
        Ok(c) => c,
        Err(_) => return 0,
    };

    let archives_url = format!("https://api.chess.com/pub/player/{username}/games/archives");
    let archives: ChessComArchives = match client.get(&archives_url).send().await {
        Ok(r) if r.status().is_success() => match r.json().await {
            Ok(a) => a,
            Err(_) => return 0,
        },
        _ => return 0,
    };

    let mut imported = 0u32;
    let mut archives_list = archives.archives;
    archives_list.reverse();

    for archive_url in archives_list {
        if imported >= MAX_ONLINE_GAMES {
            break;
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
        let month: ChessComMonth = match client.get(&archive_url).send().await {
            Ok(r) if r.status().is_success() => match r.json().await {
                Ok(m) => m,
                Err(_) => continue,
            },
            _ => continue,
        };

        let mut games = month.games;
        games.reverse();
        for game in games {
            if imported >= MAX_ONLINE_GAMES {
                break;
            }
            if game.time_class.as_deref() == Some("bullet") {
                continue;
            }

            let is_white = game.white.username.eq_ignore_ascii_case(username);
            let is_black = game.black.username.eq_ignore_ascii_case(username);
            if !is_white && !is_black {
                continue;
            }
            let color = if is_white { "white" } else { "black" };

            let (eco, opening_name) =
                pgn_meta::resolve_opening(game.eco.as_deref(), None, &game.pgn);
            let external_id = game.url.rsplit('/').next().unwrap_or(&game.url).to_string();
            let played_at = game
                .end_time
                .and_then(|t| chrono::DateTime::from_timestamp(t, 0))
                .map(|dt| dt.to_rfc3339());

            let result_pgn = pgn_result_from_sides(&game.white.result, &game.black.result);

            let _ = db.upsert_game(
                "chesscom",
                &external_id,
                &game.pgn,
                &game.white.username,
                &game.black.username,
                game.white.rating,
                game.black.rating,
                &result_pgn,
                eco.as_deref(),
                opening_name.as_deref(),
                game.time_class.as_deref(),
                played_at.as_deref(),
                false,
                Some(color),
            );

            collector.add_game(
                opponent_name,
                &game.white.username,
                &game.black.username,
                &result_pgn,
                eco,
                opening_name,
                color,
                played_at,
                "chesscom",
                game.time_class,
            );
            imported += 1;
        }
    }
    imported
}

#[derive(Debug, Deserialize)]
struct ChessComArchives {
    archives: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ChessComMonth {
    games: Vec<ChessComGameRow>,
}

#[derive(Debug, Deserialize)]
struct ChessComGameRow {
    url: String,
    pgn: String,
    time_class: Option<String>,
    end_time: Option<i64>,
    eco: Option<String>,
    white: ChessComSide,
    black: ChessComSide,
}

#[derive(Debug, Deserialize)]
struct ChessComSide {
    username: String,
    rating: Option<i32>,
    result: String,
}

fn pgn_result_from_sides(white_result: &str, black_result: &str) -> String {
    match (white_result, black_result) {
        ("win", _) => "1-0".to_string(),
        (_, "win") => "0-1".to_string(),
        _ => "1/2-1/2".to_string(),
    }
}

async fn import_lichess_games(
    db: &Database,
    username: &str,
    opponent_name: &str,
    collector: &mut Collector,
) -> u32 {
    let client = match http_client() {
        Ok(c) => c,
        Err(_) => return 0,
    };

    let url = format!("https://lichess.org/api/games/user/{username}");
    let response = match client
        .get(&url)
        .header("Accept", "application/x-ndjson")
        .query(&[
            ("max", MAX_ONLINE_GAMES.to_string()),
            ("opening", "true".to_string()),
            ("clocks", "false".to_string()),
            ("perfType", "rapid,blitz,classical".to_string()),
            ("rated", "true".to_string()),
        ])
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => r,
        _ => return 0,
    };

    let text = match response.text().await {
        Ok(t) => t,
        Err(_) => return 0,
    };

    let mut imported = 0u32;
    for line in text.lines() {
        if line.trim().is_empty() || imported >= MAX_ONLINE_GAMES {
            break;
        }
        let game: LichessGameRow = match serde_json::from_str(line) {
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
        if !is_white && !is_black {
            continue;
        }
        let color = if is_white { "white" } else { "black" };

        let headers = pgn_meta::extract_headers(&pgn);
        let (eco, opening_name) = pgn_meta::resolve_opening(
            game.opening.as_ref().and_then(|o| o.eco.as_deref()),
            game.opening.as_ref().and_then(|o| o.name.as_deref()),
            &pgn,
        );
        let eco = eco.or(headers.eco);
        let opening_name = opening_name.or(headers.opening);

        let result_pgn = match game.winner.as_deref() {
            Some("white") => "1-0",
            Some("black") => "0-1",
            _ => "1/2-1/2",
        };

        let played_at = game
            .created_at
            .and_then(|t| chrono::DateTime::from_timestamp_millis(t))
            .map(|dt| dt.to_rfc3339());

        let _ = db.upsert_game(
            "lichess",
            &game.id,
            &pgn,
            &white_name,
            &black_name,
            game.players.white.rating,
            game.players.black.rating,
            result_pgn,
            eco.as_deref(),
            opening_name.as_deref(),
            game.speed.as_deref(),
            played_at.as_deref(),
            false,
            Some(color),
        );

        collector.add_game(
            opponent_name,
            &white_name,
            &black_name,
            result_pgn,
            eco,
            opening_name,
            color,
            played_at,
            "lichess",
            game.speed,
        );
        imported += 1;
    }
    imported
}

#[derive(Debug, Deserialize)]
struct LichessGameRow {
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
    white: LichessPlayerSide,
    black: LichessPlayerSide,
}

#[derive(Debug, Deserialize)]
struct LichessPlayerSide {
    user: Option<LichessUserName>,
    rating: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct LichessUserName {
    name: String,
}

#[derive(Debug, Deserialize)]
struct LichessOpening {
    eco: Option<String>,
    name: Option<String>,
}

async fn import_chessgames(
    db: &Database,
    player_id: &str,
    opponent_name: &str,
    collector: &mut Collector,
) -> u32 {
    let games = match super::chessgames::fetch_recent_games(player_id, MAX_CHESSGAMES).await {
        Ok(g) => g,
        Err(_) => return 0,
    };

    let mut imported = 0u32;
    for g in games {
        let (eco, opening) = pgn_meta::resolve_opening(None, None, &g.pgn);
        let white_lower = g.white.to_lowercase();
        let black_lower = g.black.to_lowercase();
        let name_lower = opponent_name.to_lowercase();
        let color = if white_lower.contains(&name_lower) || g.white.eq_ignore_ascii_case(opponent_name) {
            "white"
        } else if black_lower.contains(&name_lower) || g.black.eq_ignore_ascii_case(opponent_name) {
            "black"
        } else {
            "white"
        };

        let ext_id = format!("cg_{}", g.game_id);
        let _ = db.upsert_game(
            "chessgames",
            &ext_id,
            &g.pgn,
            &g.white,
            &g.black,
            None,
            None,
            &g.result,
            eco.as_deref(),
            opening.as_deref(),
            Some("classical"),
            g.date.as_deref(),
            false,
            Some(color),
        );

        collector.add_game(
            opponent_name,
            &g.white,
            &g.black,
            &g.result,
            eco,
            opening,
            color,
            g.date,
            "chessgames",
            Some("classical".to_string()),
        );
        imported += 1;
    }
    imported
}

fn result_for_player(result_pgn: &str, is_white: bool) -> String {
    match result_pgn {
        "1-0" if is_white => "win",
        "0-1" if !is_white => "win",
        "1/2-1/2" | "1/2" => "draw",
        "1-0" | "0-1" => "loss",
        "*" => "draw",
        _ => "draw",
    }
    .to_string()
}

fn build_style_summary(
    candidate: &OpponentCandidate,
    record: &DossierRecord,
    white_openings: &[DossierOpeningStat],
    black_openings: &[DossierOpeningStat],
    ratings: &[DossierRatingLine],
) -> String {
    let mut parts = Vec::new();

    if let Some(r) = ratings.first() {
        parts.push(format!("{} {}: {}", r.source, r.label, r.rating));
    } else if let Some(r) = candidate.rating {
        parts.push(format!("Rating ~{r}"));
    }

    if record.as_white.games + record.as_black.games > 0 {
        let total = record.wins + record.draws + record.losses;
        let win_pct = if total > 0 {
            (record.wins as f64 / total as f64 * 100.0).round() as u32
        } else {
            0
        };
        parts.push(format!(
            "Recent sample: {}W-{}D-{}L ({}% wins over {} games)",
            record.wins, record.draws, record.losses, win_pct, total
        ));

        if record.as_white.games > record.as_black.games + 2 {
            parts.push("Prefers White".to_string());
        } else if record.as_black.games > record.as_white.games + 2 {
            parts.push("Prefers Black".to_string());
        }
    }

    if let Some(top) = white_openings.first() {
        parts.push(format!("As White: {} ({} games)", top.name, top.games));
    }
    if let Some(top) = black_openings.first() {
        parts.push(format!("As Black: {} ({} games)", top.name, top.games));
    }

    if parts.is_empty() {
        if let Some(ref u) = candidate.chesscom_username {
            parts.push(format!("Chess.com: @{u}"));
        }
        if let Some(ref u) = candidate.lichess_username {
            parts.push(format!("Lichess: @{u}"));
        }
        if let Some(ref id) = candidate.uscf_id {
            parts.push(format!("USCF #{id}"));
        }
        if let Some(ref id) = candidate.fide_id {
            parts.push(format!("FIDE #{id}"));
        }
    }

    if parts.is_empty() {
        "Profile linked — limited game data available. Search online accounts or ChessGames for deeper prep."
            .to_string()
    } else {
        parts.join(" · ")
    }
}

fn build_tactical_notes(
    record: &DossierRecord,
    white_openings: &[DossierOpeningStat],
    black_openings: &[DossierOpeningStat],
) -> String {
    let total = record.wins + record.draws + record.losses;
    if total == 0 {
        return "No recent games imported — tactical patterns unknown. Default to sound, principled play."
            .to_string();
    }

    let mut notes: Vec<String> = Vec::new();
    let loss_rate = record.losses as f64 / total as f64;

    if loss_rate > 0.55 {
        notes.push("Loses frequently in recent games — look for early pressure and tactical chances.".to_string());
    } else if record.wins as f64 / total as f64 > 0.55 {
        notes.push("Strong recent form — play solidly and avoid unnecessary complications.".to_string());
    }

    if record.as_white.games > 0 && record.as_white.losses > record.as_white.wins {
        notes.push("Struggles as White in sample — consider fighting for the initiative with Black.".to_string());
    }
    if record.as_black.games > 0 && record.as_black.losses > record.as_black.wins {
        notes.push("Weaker as Black — prioritize a reliable defense and counterattacking chances.".to_string());
    }

    for op in white_openings.iter().chain(black_openings.iter()).take(3) {
        if op.games >= 3 && op.losses > op.wins {
            notes.push(format!(
                "Scores poorly in {} as {} ({}L vs {}W) — target this system.",
                op.name, op.color, op.losses, op.wins
            ));
        }
    }

    if notes.is_empty() {
        "Balanced recent results — focus on your best repertoire and standard time management.".to_string()
    } else {
        notes.join(" ")
    }
}

fn build_recommended_prep(
    candidate: &OpponentCandidate,
    openings: &[String],
    record: &DossierRecord,
    ratings: &[DossierRatingLine],
) -> String {
    let rating = ratings
        .first()
        .map(|r| r.rating)
        .or(candidate.rating);

    let mut steps = Vec::new();

    if !openings.is_empty() {
        steps.push(format!(
            "1. Study their main lines: {}.",
            openings.join(", ")
        ));
        steps.push(
            "2. Use Analysis to review imported games — note recurring plans and typical mistakes."
                .to_string(),
        );
    } else {
        steps.push(
            "1. Import more games (Chess.com / Lichess username or ChessGames) for opening-specific prep."
                .to_string(),
        );
    }

    match rating {
        Some(r) if r < 1400 => {
            steps.push("3. Play principled development — avoid traps and focus on hanging-piece tactics.".to_string());
        }
        Some(r) if r < 1800 => {
            steps.push("3. Stick to a solid opening you know well; punish slow play and loose pieces.".to_string());
        }
        Some(r) if r < 2200 => {
            steps.push("3. Prepare one anti-line per main opening; review critical middlegame pawn structures.".to_string());
        }
        Some(_) => {
            steps.push("3. Deep prep required — study recent games and prepare surprise weapons in main lines.".to_string());
        }
        None => {
            steps.push("3. Default to your tournament repertoire until more data is available.".to_string());
        }
    }

    if record.as_white.games > 0 && record.as_black.games > 0 {
        steps.push(format!(
            "4. Expect {} as White and {} as Black in their sample.",
            openings.first().cloned().unwrap_or_else(|| "their usual".to_string()),
            openings.get(1).cloned().unwrap_or_else(|| "a solid defense".to_string()),
        ));
    }

    steps.join("\n")
}

async fn try_ai_insight(
    db: &Database,
    candidate: &OpponentCandidate,
    style_summary: &str,
    openings: &[String],
    record: &DossierRecord,
    ratings: &[DossierRatingLine],
) -> Option<String> {
    let settings = db.get_settings().ok()?;
    let model = settings.ollama_model?;
    if model.is_empty() {
        return None;
    }

    let status = coach::check_status().await;
    if !status.connected {
        return None;
    }

    let rating_text = ratings
        .iter()
        .map(|r| format!("{} {}: {}", r.source, r.label, r.rating))
        .collect::<Vec<_>>()
        .join(", ");

    let prompt = format!(
        "Analyze this tournament opponent and give concise prep advice (3-5 bullet points):\n\
         Name: {}\n\
         Ratings: {}\n\
         Summary: {}\n\
         Main openings: {}\n\
         Recent record: {}W-{}D-{}L ({} as White, {} as Black)\n\
         Focus on OTB tournament prep: what to play, what to avoid, and psychological approach.",
        candidate.name,
        if rating_text.is_empty() { "unknown".to_string() } else { rating_text },
        style_summary,
        if openings.is_empty() { "unknown".to_string() } else { openings.join(", ") },
        record.wins,
        record.draws,
        record.losses,
        record.as_white.games,
        record.as_black.games,
    );

    let messages = vec![crate::models::CoachMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    let chat_fut = coach::chat(
        &model,
        &messages,
        "Opponent scouting dossier — tournament preparation.",
    );
    tokio::time::timeout(Duration::from_secs(6), chat_fut)
        .await
        .ok()
        .and_then(|r| r.ok())
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("ChessScope/0.1 (tournament prep)")
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())
}
