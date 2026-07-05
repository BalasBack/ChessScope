import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const docs = join(process.cwd(), "docs");
const index = join(docs, "index.html");
const notFound = join(docs, "404.html");

if (!existsSync(index)) {
  console.error("docs/index.html not found — run build:web first");
  process.exit(1);
}

copyFileSync(index, notFound);
console.log("Copied docs/index.html → docs/404.html for GitHub Pages SPA routing");
