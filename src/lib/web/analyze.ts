import { parsePgnMovesDetailed } from "../chess";
import type { AnalysisProgress, GameAnalysis, MoveAnalysis } from "../types";
import * as db from "./db";
import {
  classifyMove,
  cpLossForMove,
  evaluateFen,
  evaluateWithMoves,
  toWhitePerspective,
} from "./stockfish-engine";

function emitProgress(p: AnalysisProgress) {
  window.dispatchEvent(new CustomEvent("analysis-progress", { detail: p }));
}

export async function analyzeGame(
  gameId: number,
  depth: number,
): Promise<GameAnalysis> {
  const game = await db.getGame(gameId);
  if (!game?.pgn) throw new Error("Game not found");

  const ownColor = game.own_color ?? "white";
  const parsed = parsePgnMovesDetailed(game.pgn);
  if (!parsed.length) throw new Error("No moves to analyze");

  const moveAnalyses: MoveAnalysis[] = [];
  const positionEvals: (number | null)[] = [];
  const ownCpLosses: number[] = [];

  for (let idx = 0; idx < parsed.length; idx++) {
    const mv = parsed[idx];
    emitProgress({
      game_id: gameId,
      current: idx + 1,
      total: parsed.length,
      message: `Analyzing move ${idx + 1} / ${parsed.length}: ${mv.san}`,
    });

    const whiteToMove = mv.fenBefore.includes(" w ");
    const isOwnMove =
      (ownColor === "white" && whiteToMove) ||
      (ownColor === "black" && !whiteToMove);

    const before = await evaluateFen(mv.fenBefore, depth);
    const positionEval = toWhitePerspective(
      before.evalCp,
      before.mateIn,
      whiteToMove,
    );
    positionEvals.push(positionEval);

    const playedAfter = await evaluateWithMoves(
      mv.fenBefore,
      [mv.uci],
      depth,
    );
    const afterWhiteToMove = !whiteToMove;
    if (idx === parsed.length - 1) {
      positionEvals.push(
        toWhitePerspective(
          playedAfter.evalCp,
          playedAfter.mateIn,
          afterWhiteToMove,
        ),
      );
    }

    let bestAfter = playedAfter;
    if (
      before.bestMoveUci &&
      before.bestMoveUci !== mv.uci
    ) {
      bestAfter = await evaluateWithMoves(
        mv.fenBefore,
        [before.bestMoveUci],
        depth,
      );
    }

    const cpLoss = isOwnMove
      ? cpLossForMove(bestAfter, playedAfter, whiteToMove)
      : 0;
    if (isOwnMove) ownCpLosses.push(cpLoss);

    moveAnalyses.push({
      move_index: idx,
      san: mv.san,
      fen: mv.fenBefore,
      eval_cp: positionEval,
      best_move_uci: before.bestMoveUci,
      classification: isOwnMove ? classifyMove(cpLoss) : "opponent",
      cp_loss: cpLoss,
      is_own_move: isOwnMove,
    });
  }

  const avgCpLoss = ownCpLosses.length
    ? ownCpLosses.reduce((a, b) => a + b, 0) / ownCpLosses.length
    : 0;

  const analysis: GameAnalysis = {
    game_id: gameId,
    moves: moveAnalyses,
    position_evals: positionEvals,
    avg_cp_loss: avgCpLoss,
    analyzed: true,
  };
  await db.saveAnalysis(gameId, analysis);
  return analysis;
}
