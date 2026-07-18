import type { AccountSettings } from "./types";

function nameMatches(player: string, username: string): boolean {
  return player.trim().toLowerCase() === username.trim().toLowerCase();
}

function playerIsUser(
  white: string,
  black: string,
  username: string | null | undefined,
): boolean {
  if (!username?.trim()) return false;
  return nameMatches(white, username) || nameMatches(black, username);
}

/** True if a game marked is_own_game likely came from opponent scout import. */
export function shouldRelabelAsScout(
  game: {
    source: string;
    white_player: string;
    black_player: string;
    is_own_game: boolean;
  },
  settings: AccountSettings,
): boolean {
  if (!game.is_own_game) return false;

  const chesscom = settings.chesscom_username;
  const lichess = settings.lichess_username;

  if (!chesscom && !lichess) return false;

  if (game.source === "chessgames") return true;

  if (game.source === "chesscom") {
    if (chesscom) {
      return !playerIsUser(game.white_player, game.black_player, chesscom);
    }
    if (lichess) {
      return !playerIsUser(game.white_player, game.black_player, lichess);
    }
  }

  if (game.source === "lichess") {
    if (lichess) {
      return !playerIsUser(game.white_player, game.black_player, lichess);
    }
    if (chesscom) {
      return !playerIsUser(game.white_player, game.black_player, chesscom);
    }
  }

  return false;
}
