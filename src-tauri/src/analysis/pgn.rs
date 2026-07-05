use shakmaty::fen::Fen;
use shakmaty::san::San;
use shakmaty::uci::UciMove;
use shakmaty::{Chess, Position};

use pgn_reader::{BufferedReader, SanPlus, Skip, Visitor};

#[derive(Debug, Clone)]
pub struct ParsedMove {
    pub san: String,
    pub uci: String,
    pub fen_before: String,
}

struct MoveCollector {
    pos: Chess,
    moves: Vec<ParsedMove>,
    error: Option<String>,
}

impl MoveCollector {
    fn new() -> Self {
        Self {
            pos: Chess::default(),
            moves: Vec::new(),
            error: None,
        }
    }
}

impl Visitor for MoveCollector {
    type Result = Result<Vec<ParsedMove>, String>;

    fn begin_game(&mut self) {
        self.pos = Chess::default();
        self.moves.clear();
        self.error = None;
    }

    fn begin_variation(&mut self) -> Skip {
        Skip(true)
    }

    fn san(&mut self, san_plus: SanPlus) {
        if self.error.is_some() {
            return;
        }
        let fen_before =
            Fen::from_position(&self.pos, shakmaty::EnPassantMode::Legal).to_string();
        let san_str = san_plus.san.to_string();
        let san: San = match San::from_ascii(san_str.as_bytes()) {
            Ok(s) => s,
            Err(e) => {
                self.error = Some(format!("Invalid SAN {san_str}: {e}"));
                return;
            }
        };
        match san.to_move(&self.pos) {
            Ok(m) => {
                let uci = UciMove::from_move(m, shakmaty::CastlingMode::Standard).to_string();
                self.moves.push(ParsedMove {
                    san: san_str,
                    uci,
                    fen_before,
                });
                let next = std::mem::replace(&mut self.pos, Chess::default()).play(m);
                self.pos = next.unwrap_or_else(|e| panic!("legal move failed: {e}"));
            }
            Err(e) => {
                self.error = Some(format!("Illegal move {san_str}: {e}"));
            }
        }
    }

    fn end_game(&mut self) -> Self::Result {
        if let Some(err) = self.error.take() {
            return Err(err);
        }
        Ok(self.moves.clone())
    }
}

pub fn parse_pgn_moves(pgn: &str) -> Result<Vec<ParsedMove>, String> {
    let mut reader = BufferedReader::new_cursor(pgn.as_bytes());
    let mut collector = MoveCollector::new();
    let result = reader
        .read_game(&mut collector)
        .map_err(|e| format!("PGN read error: {e}"))?
        .ok_or_else(|| "No game found in PGN".to_string())??;

    if result.is_empty() {
        return Err("No moves found in PGN".to_string());
    }
    Ok(result)
}

pub fn classify_move(cp_loss: i32) -> &'static str {
    match cp_loss {
        0..=25 => "best",
        26..=75 => "excellent",
        76..=150 => "good",
        151..=300 => "inaccuracy",
        301..=600 => "mistake",
        _ => "blunder",
    }
}

pub fn uci_to_san(fen: &str, uci: &str) -> Option<String> {
    let pos: Chess = Fen::from_ascii(fen.as_bytes())
        .ok()?
        .into_position(shakmaty::CastlingMode::Standard)
        .ok()?;
    let uci_move = UciMove::from_ascii(uci.as_bytes()).ok()?;
    let m = uci_move.to_move(&pos).ok()?;
    Some(San::from_move(&pos, m).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_lichess_clock_annotations() {
        let pgn = r#"[Event "Rated"]
[Opening "https://lichess.org/opening/Italian_Game"]

1. e4 { [%clk 0:03:00] } 1... e5 { [%clk 0:03:00] } 2. Nf3 { [%clk 0:02:58] } 2... Nc6 { [%clk 0:02:57] } *"#;
        let moves = parse_pgn_moves(pgn).expect("parse");
        assert_eq!(moves.len(), 4);
        assert_eq!(moves[0].san, "e4");
        assert_eq!(moves[3].san, "Nc6");
    }
}
