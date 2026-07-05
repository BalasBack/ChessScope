pub mod chesscom;
pub mod lichess;
pub mod pgn_meta;
pub mod uscf;

use crate::db::Database;
use crate::models::ImportResult;

pub async fn import_chesscom(
    db: &Database,
    username: &str,
    max_games: u32,
) -> Result<ImportResult, String> {
    chesscom::import_games(db, username, max_games).await
}

pub async fn import_lichess(
    db: &Database,
    username: &str,
    max_games: u32,
) -> Result<ImportResult, String> {
    lichess::import_games(db, username, max_games).await
}

pub async fn lookup_uscf(uscf_id: &str) -> Result<crate::models::UscfMember, String> {
    uscf::lookup_member(uscf_id).await
}
