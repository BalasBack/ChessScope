# ScoutNScore

**ScoutNScore** (by [BalasBack](https://www.youtube.com/channel/UCGhv2Iena67AWNrxHr5Cqow)) is chess tournament prep software for serious players — available as a **Windows desktop app** and a **web app**.

| | Desktop (Windows) | Web |
|---|---|---|
| **Run** | Install `.msi` / `.exe` or `npm run tauri dev` | [balasback.github.io/ChessScope](https://balasback.github.io/ChessScope/) |
| **Storage** | Local SQLite | Browser IndexedDB |
| **Analysis** | Stockfish (native) | Stockfish WASM |
| **AI Coach** | Ollama (local LLM) | Free cloud coach (no signup) |
| **Opponent scout** | USCF, FIDE, ChessGames, Lichess, Chess.com | USCF, Lichess & Chess.com |

## Features

- Import games from **Chess.com** and **Lichess**
- **Dashboard** with opening repertoire, win rates, and time control breakdown
- **Stockfish analysis** with move classifications (best → blunder)
- **Training** puzzles from your own blunders
- **Game review** with move navigation and eval display
- **AI Coach** (desktop) powered by local **Ollama**
- **USCF profile lookup** (desktop)
- **Opponent scout** — full dossiers on desktop; basic import on web

---

## Desktop app (Windows)

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (`rustup default stable-x86_64-pc-windows-msvc`)
- **Visual Studio Build Tools** with **Desktop development with C++**
- [Ollama](https://ollama.com/) (optional, for AI coach): `ollama pull llama3.1`

### Stockfish (desktop)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/download-stockfish.ps1
```

Or install Stockfish to PATH from [stockfishchess.org](https://stockfishchess.org/download/).

### Development

```powershell
npm install
npm run tauri dev
```

Or:

```powershell
npm run dev:app
```

You can also open `http://localhost:1420` in a browser during dev — it uses the web backend (IndexedDB + WASM) automatically when not running inside Tauri.

### Build installer

```powershell
npm run tauri build
```

Output: `src-tauri/target/release/bundle/` (`.msi` or `.exe`).

Upload to **GitHub Releases** so the web app’s download link works.

---

## Web app (GitHub Pages)

The full UI runs in the browser — import, dashboard, analysis, training, and opponent search (Lichess/Chess.com). Data stays in your browser; nothing is sent to a ChessScope server.

### Build & deploy

```powershell
npm run build:web
git add docs/
git commit -m "Deploy web app"
git push
```

On GitHub: **Settings → Pages → Deploy from branch `main`, folder `/docs`**.

Live at: **https://balasback.github.io/ChessScope/**

After changing frontend code, run `npm run build:web` again and push `docs/`.

### Preview locally

```powershell
npm run build:web
npm run preview:web
```

---

## Usage

1. Open **Settings** and enter your Chess.com / Lichess usernames (and USCF ID on desktop)
2. **Sync games** from the Dashboard
3. Review stats and run **Analysis** with Stockfish
4. Train on your **blunders** in Training
5. **Scout opponents** before events (desktop: all sources; web: Lichess/Chess.com)
6. Chat with the **AI Coach** on desktop (requires Ollama)

## Tech stack

- **Desktop:** Tauri 2 + Rust, SQLite, native Stockfish, Ollama
- **Web:** React + TypeScript + Tailwind, IndexedDB, Stockfish WASM
- **Shared:** React UI, chess.js, react-chessboard
