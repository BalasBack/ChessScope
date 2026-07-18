export type EngineEval = {
  evalCp: number;
  mateIn: number | null;
  bestMoveUci: string | null;
};

let worker: Worker | null = null;
let ready = false;
let lines: string[] = [];
let waiters: Array<(line: string) => void> = [];
let initError: string | null = null;

function workerBaseUrl(): URL {
  return new URL(`${import.meta.env.BASE_URL}stockfish/`, window.location.href);
}

/**
 * stockfish.js lite-single: load the .js file as a Worker (no hash).
 * It derives the .wasm URL from its own script path.
 * The "#…,worker" hash is only for pthread stubs and must NOT be used here —
 * that hash makes the script skip all engine init (causing UCI timeouts).
 */
function createStockfishWorker(): Worker {
  const jsUrl = new URL("stockfish-18-lite-single.js", workerBaseUrl()).href;
  return new Worker(jsUrl);
}

function resetWorkerState() {
  try {
    worker?.terminate();
  } catch {
    /* ignore */
  }
  worker = null;
  ready = false;
  lines = [];
  waiters = [];
  initError = null;
}

function getWorker(): Worker {
  if (worker) return worker;
  if (initError) throw new Error(initError);

  try {
    worker = createStockfishWorker();
  } catch (e) {
    initError = `Failed to start Stockfish worker: ${e}`;
    throw new Error(initError);
  }

  worker.onerror = (ev) => {
    initError =
      (ev as ErrorEvent).message ||
      "Stockfish worker failed to load the WASM engine.";
  };
  worker.onmessage = (e: MessageEvent<string | { percent?: number }>) => {
    // Download-progress objects from MessageChannel — ignore
    if (e.data && typeof e.data === "object") return;
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

function readLine(timeoutMs = 90_000): Promise<string> {
  if (lines.length) return Promise.resolve(lines.shift()!);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = waiters.indexOf(onLine);
      if (idx >= 0) waiters.splice(idx, 1);
      reject(
        new Error(
          initError ||
            "Stockfish timed out waiting for engine output (WASM may still be downloading — try again)",
        ),
      );
    }, timeoutMs);
    const onLine = (line: string) => {
      clearTimeout(timer);
      resolve(line);
    };
    waiters.push(onLine);
  });
}

async function ensureReady(): Promise<void> {
  if (ready) return;
  if (initError) throw new Error(initError);

  getWorker();
  if (initError) throw new Error(initError);

  // Commands are queued inside stockfish.js until WASM finishes loading.
  await send("uci");
  for (;;) {
    if (initError) throw new Error(initError);
    const line = await readLine(90_000);
    if (line.includes("uciok")) break;
  }
  await send("isready");
  for (;;) {
    if (initError) throw new Error(initError);
    const line = await readLine(30_000);
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

/** Cap depth on web so analysis stays usable */
function webDepth(depth: number): number {
  return Math.min(Math.max(depth, 8), 12);
}

export async function evaluateFen(
  fen: string,
  depth: number,
): Promise<EngineEval> {
  await ensureReady();
  lines.length = 0;
  await send(`position fen ${fen}`);
  await send(`go depth ${webDepth(depth)}`);
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
  await send(`go depth ${webDepth(depth)}`);
  return readGoResult();
}

export async function checkStockfish(): Promise<{
  available: boolean;
  path: string | null;
  error: string | null;
}> {
  try {
    const jsUrl = new URL("stockfish-18-lite-single.js", workerBaseUrl()).href;
    const wasmUrl = new URL(
      "stockfish-18-lite-single.wasm",
      workerBaseUrl(),
    ).href;

    const [jsRes, wasmRes] = await Promise.all([
      fetch(jsUrl, { method: "HEAD", cache: "no-cache" }),
      fetch(wasmUrl, { method: "HEAD", cache: "no-cache" }),
    ]);

    if (!jsRes.ok) {
      return {
        available: false,
        path: null,
        error: `Stockfish script missing (${jsRes.status}).`,
      };
    }
    if (!wasmRes.ok) {
      return {
        available: false,
        path: null,
        error: `Stockfish WASM missing (${wasmRes.status}).`,
      };
    }

    resetWorkerState();
    await ensureReady();
    return {
      available: true,
      path: "Stockfish WASM (browser)",
      error: null,
    };
  } catch (e) {
    resetWorkerState();
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
