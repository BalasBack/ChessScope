import { Component, ReactNode } from "react";
import { Chessboard } from "react-chessboard";
import { START_FEN } from "../lib/chess";

type ChessBoardProps = {
  fen: string;
  allowDragging?: boolean;
  showAnimations?: boolean;
  onPieceDrop?: (args: {
    piece: { position: string; pieceType: string; isSparePiece: boolean };
    sourceSquare: string;
    targetSquare: string | null;
  }) => boolean;
};

type State = { error: string | null };

export class ChessBoardView extends Component<ChessBoardProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(err: Error): State {
    return { error: err.message };
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-[var(--color-surface-3)] text-sm text-red-300">
          Board error: {this.state.error}
        </div>
      );
    }

    const position =
      !this.props.fen || this.props.fen === "start"
        ? START_FEN
        : this.props.fen;

    return (
      <div className="aspect-square w-full">
        <Chessboard
          options={{
            position,
            allowDragging: this.props.allowDragging ?? false,
            onPieceDrop: this.props.onPieceDrop,
            showAnimations: this.props.showAnimations ?? false,
            animationDurationInMs: 200,
            boardStyle: {
              borderRadius: "6px",
              width: "100%",
              height: "100%",
              boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
            },
            darkSquareStyle: { backgroundColor: "#769656" },
            lightSquareStyle: { backgroundColor: "#eeeed2" },
          }}
        />
      </div>
    );
  }
}
