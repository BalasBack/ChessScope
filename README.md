# ChessScope

**ChessScope** is a local-first desktop app for serious chess tournament preparation. It analyzes your Chess.com and Lichess games, links your USCF profile, provides an offline AI coach via Ollama, and helps scout opponents before events.

## Features (v0.1)

- Import games from **Chess.com** and **Lichess** with local SQLite caching
- **Dashboard** with opening repertoire, win rates, and time control breakdown
- **Stockfish analysis** with move classifications (best → blunder)
- **Training** puzzles from your own blunders
- **Game review** with move navigation and eval display
- **AI Coach** powered by local **Ollama** LLM
- **USCF profile lookup** by member ID (MUIR API)
- Opponent scout foundation (full ChessGames/FIDE dossiers coming soon)

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (`rustup default stable-x86_64-pc-windows-msvc`)
- **Visual Studio Build Tools** with **Desktop development with C++** workload  
  (Visual Studio Installer → Modify → check "Desktop development with C++")
- [Ollama](https://ollama.com/) (optional, for AI coach): `ollama pull llama3.1`

## Stockfish Setup

```powershell
powershell -ExecutionPolicy Bypass -File scripts/download-stockfish.ps1
```

Or install Stockfish to PATH from [stockfishchess.org](https://stockfishchess.org/download/).

## Development

```bash
npm install
npm run tauri dev
```

Or use the helper script (auto-detects `vcvars64.bat`):

```powershell
npm run dev:app
```

## Build

```bash
npm run tauri build
```

## Usage

1. Open **Settings** and enter your Chess.com / Lichess usernames and USCF ID
2. Click **Sync Games** on the Dashboard
3. Review stats and games in **Analysis**
4. Chat with the **AI Coach** (requires Ollama running)
5. Look up opponents by **USCF ID** in **Opponent Scout**

## Tech Stack

- Tauri 2 + Rust backend
- React + TypeScript + Tailwind CSS
- SQLite (local cache)
- Stockfish (planned), Ollama (AI coach)
