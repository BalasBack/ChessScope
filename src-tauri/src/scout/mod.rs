mod chesscom;
mod chessgames;
mod dossier;
mod fide;
mod lichess;

use crate::models::{OpponentCandidate, OpponentDossier};

pub async fn search_opponents(
    query: &str,
    sources: Option<Vec<String>>,
) -> Result<Vec<OpponentCandidate>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("Enter a player name or username to search".to_string());
    }

    let want = |src: &str| {
        sources
            .as_ref()
            .map(|s| s.iter().any(|x| x.eq_ignore_ascii_case(src)))
            .unwrap_or(true)
    };

    let mut results = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    if want("uscf") {
        let uscf = if query.chars().all(|c| c.is_ascii_digit()) {
            search_uscf_by_id(query).await
        } else {
            search_uscf_by_name(query).await
        };
        match uscf {
            Ok(mut found) => results.append(&mut found),
            Err(e) => errors.push(format!("USCF: {e}")),
        }
    }

    if want("fide") {
        match fide::search_players(query).await {
            Ok(mut found) => results.append(&mut found),
            Err(e) => errors.push(format!("FIDE: {e}")),
        }
    }

    if want("lichess") {
        match lichess::search_players(query).await {
            Ok(mut found) => results.append(&mut found),
            Err(e) => errors.push(format!("Lichess: {e}")),
        }
    }

    if want("chesscom") {
        match chesscom::search_players(query).await {
            Ok(mut found) => results.append(&mut found),
            Err(e) => errors.push(format!("Chess.com: {e}")),
        }
    }

    if want("online") {
        if !want("lichess") {
            if let Ok(mut found) = lichess::search_players(query).await {
                results.append(&mut found);
            }
        }
        if !want("chesscom") {
            if let Ok(mut found) = chesscom::search_players(query).await {
                results.append(&mut found);
            }
        }
    }

    if want("chessgames") {
        match chessgames::search_players(query).await {
            Ok(mut found) => results.append(&mut found),
            Err(e) => errors.push(format!("ChessGames: {e}")),
        }
    }

    if results.is_empty() {
        let detail = if errors.is_empty() {
            String::new()
        } else {
            format!(" ({})", errors.join("; "))
        };
        return Err(format!("No opponents found for \"{query}\"{detail}"));
    }
    Ok(results)
}

pub async fn build_dossier(
    db: &crate::db::Database,
    candidate: &OpponentCandidate,
) -> Result<OpponentDossier, String> {
    dossier::build(db, candidate).await
}

async fn search_uscf_by_id(id: &str) -> Result<Vec<OpponentCandidate>, String> {
    let member = crate::import::uscf::lookup_member(id).await?;
    Ok(vec![member_to_candidate(&member)])
}

async fn search_uscf_by_name(name: &str) -> Result<Vec<OpponentCandidate>, String> {
    let members = crate::import::uscf::search_members(name, 12).await?;
    Ok(members.iter().map(member_to_candidate).collect())
}

fn member_to_candidate(member: &crate::models::UscfMember) -> OpponentCandidate {
    OpponentCandidate {
        id: format!("uscf_{}", member.id),
        name: format!("{} {}", member.first_name, member.last_name),
        source: "uscf".to_string(),
        rating: member.ratings.iter().find_map(|r| {
            if r.rating_system == "R"
                || r.rating_system.contains("Regular")
                || r.rating_system.contains("OverTheBoardRegular")
            {
                r.rating
            } else {
                None
            }
        }),
        federation: member.state.clone(),
        fide_id: member.fide_id.clone(),
        uscf_id: Some(member.id.clone()),
        chessgames_id: None,
        chesscom_username: None,
        lichess_username: None,
    }
}
