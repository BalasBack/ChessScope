import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const srcDir = join(process.cwd(), "node_modules", "stockfish", "bin");
const destDir = join(process.cwd(), "public", "stockfish");
const files = ["stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm"];

if (!existsSync(srcDir)) {
  console.warn("stockfish bin/ not found — run npm install first");
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
for (const file of files) {
  const src = join(srcDir, file);
  if (!existsSync(src)) {
    console.error(`Missing ${src}`);
    process.exit(1);
  }
  copyFileSync(src, join(destDir, file));
}
console.log(`Copied Stockfish lite-single → public/stockfish/`);
