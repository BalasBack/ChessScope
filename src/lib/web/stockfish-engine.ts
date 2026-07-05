const SF_VERSION = "18.0.8";
const SF_JS = `https://cdn.jsdelivr.net/npm/stockfish@${SF_VERSION}/bin/stockfish-18-lite-single.js`;
const SF_WASM = `https://cdn.jsdelivr.net/npm/stockfish@${SF_VERSION}/bin/stockfish-18-lite-single.wasm`;

export type EngineEval = {
  evalCp: number;
  mateIn: number | null;
  bestMoveUci: string | null;
};

let worker: Worker | null = null;
let ready = false;
let lines: string[] = [];
let waiters: Array<(line: string) => void> = [];

function getWorker(): Worker {
  if (worker) return worker;
  const url = `${SF_JS}#${encodeURIComponent(SF_WASM)},worker`;
  worker = new Worker(url);
  worker.onmessage = (e: MessageEvent<string>) => {
    const line = typeof e.data === "string" ? e.data : String(e.data);
    if (waiters.length) {
      waiters.shift()!(line);
    } else {
      lines.push(line);
    }
  };
  return worker;
}

async function send(cmd: string): Promise<void> {
  getWorker().postMessage(cmd);
}

async function readLine(): Promise<string> {
  if (lines.length) return lines.shift()!;
  return new Promise((resolve) => waiters.push(resolve));
}

async function ensureReady(): Promise<void> {
  if (ready) return;
  await send("uci");
  for (;;) {
    const line = await readLine();
    if (line.includes("uciok")) break;
  }
  await send("isready");
  for (;;) {
    const line = await readLine();
    if (line.includes("readyok")) break;
  }
  ready = true;
}

function parseCp(line: string): number | null {
  const m = line.match(/\bscore cp (-?\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function parseMate(line: string): number | null {
  const m = line.match(/\bscore mate (-?\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

async function readGoResult(): Promise<EngineEval> {
  let evalCp = 0;
  let mateIn: number | null = null;
  let bestMove: string | null = null;
  for (;;) {
    const line = await readLine();
    if (line.startsWith("info ") && line.includes(" score ")) {
      const cp = parseCp(line);
      const mate = parseMate(line);
      if (cp != null) evalCp = cp;
      if (mate != null) mateIn = mate;
    }
    if (line.startsWith("bestmove ")) {
      const parts = line.split(/\s+/);
      if (parts[1] && parts[1] !== "(none)") bestMove = parts[1];
      break;
    }
  }
  return { evalCp, mateIn, bestMoveUci: bestMove };
}

export function toWhitePerspective(
  evalCp: number,
  mateIn: number | null,
  whiteToMove: boolean,
): number {
  if (mateIn != null) {
    const sign = mateIn > 0 ? 1 : -1;
    const plies = Math.min(Math.abs(mateIn), 90);
    const cp = sign * (10_000 - plies * 100);
    return whiteToMove ? cp : -cp;
  }
  return whiteToMove ? evalCp : -evalCp;
}

export function cpLossForMove(
  best: EngineEval,
  played: EngineEval,
  movingPlayerIsWhite: boolean,
): number {
  const afterWhiteToMove = !movingPlayerIsWhite;
  const bestCp = playerCp(best, afterWhiteToMove, movingPlayerIsWhite);
  const playedCp = playerCp(played, afterWhiteToMove, movingPlayerIsWhite);
  return Math.max(0, bestCp - playedCp);
}

function playerCp(
  ev: EngineEval,
  sideToMoveIsWhite: boolean,
  forWhitePlayer: boolean,
): number {
  const white = toWhitePerspective(ev.evalCp, ev.mateIn, sideToMoveIsWhite);
  return forWhitePlayer ? white : -white;
}

export async function evaluateFen(
  fen: string,
  depth: number,
): Promise<EngineEval> {
  await ensureReady();
  lines.length = 0;
  await send(`position fen ${fen}`);
  await send(`go depth ${depth}`);
  return readGoResult();
}

export async function evaluateWithMoves(
  fen: string,
  moves: string[],
  depth: number,
): Promise<EngineEval> {
  await ensureReady();
  lines.length = 0;
  await send(`position fen ${fen} moves ${moves.join(" ")}`);
  await send(`go depth ${depth}`);
  return readGoResult();
}

export async function checkStockfish(): Promise<{
  available: boolean;
  path: string | null;
  error: string | null;
}> {
  try {
    await ensureReady();
    return { available: true, path: "Stockfish WASM (browser)", error: null };
  } catch (e) {
    return { available: false, path: null, error: String(e) };
  }
}

export function classifyMove(cpLoss: number): string {
  if (cpLoss <= 25) return "best";
  if (cpLoss <= 75) return "excellent";
  if (cpLoss <= 150) return "good";
  if (cpLoss <= 300) return "inaccuracy";
  if (cpLoss <= 600) return "mistake";
  return "blunder";
}
