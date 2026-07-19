import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const docs = join(process.cwd(), "docs");
const index = join(docs, "index.html");
const notFound = join(docs, "404.html");

/** SPA routes that must return HTTP 200 for Google (not only via 404.html). */
const ROUTES = [
  "help",
  "analysis",
  "coach",
  "training",
  "scout",
  "uscf",
  "settings",
];

if (!existsSync(index)) {
  console.error("docs/index.html not found — run build:web first");
  process.exit(1);
}

copyFileSync(index, notFound);
console.log("Copied docs/index.html → docs/404.html for GitHub Pages SPA routing");

for (const route of ROUTES) {
  const dir = join(docs, route);
  mkdirSync(dir, { recursive: true });
  copyFileSync(index, join(dir, "index.html"));
  console.log(`Copied docs/index.html → docs/${route}/index.html (HTTP 200 for crawlers)`);
}
