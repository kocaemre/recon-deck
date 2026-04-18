#!/usr/bin/env node
/**
 * Bundle Size Check (OPS-07, warn-only per ARCHITECTURE.md).
 *
 * Walks .next/static/ after an `ANALYZE=true next build`, sums file sizes,
 * and emits a GitHub Actions `::warning::` annotation if over the 2 MB budget.
 * Exits 0 regardless — this is a warn gate, not a fail gate.
 *
 * CLI: `node scripts/ci/check-bundle-size.mjs` — intended for CI after build.
 *
 * Implementation note: this is the simple "du -sb on .next/static" fallback
 * recommended in 08-RESEARCH.md Assumption A3 over parsing bundle-analyzer's
 * stats JSON (filename / shape varies across analyzer versions). Less granular
 * but rock-solid — covers the OPS-07 contract (silent regression visible in CI)
 * without depending on private bundle-analyzer file paths.
 */

import fs from "node:fs";
import path from "node:path";

const BUDGET_BYTES = 2 * 1024 * 1024; // 2 MB per OPS-07
const STATIC_DIR = path.join(process.cwd(), ".next", "static");

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(p);
    else total += fs.statSync(p).size;
  }
  return total;
}

if (!fs.existsSync(STATIC_DIR)) {
  console.log(
    `::warning title=Bundle size check skipped::.next/static/ not found. Did you run \`npm run build\` first?`
  );
  process.exit(0); // warn-only per ARCHITECTURE.md
}

const size = dirSize(STATIC_DIR);
const mb = (size / 1024 / 1024).toFixed(2);

if (size > BUDGET_BYTES) {
  console.log(
    `::warning title=Bundle size over budget::Client bundle is ${mb} MB (budget: 2.00 MB). See .next/analyze/client.html.`
  );
} else {
  console.log(`OK: client bundle is ${mb} MB (budget: 2.00 MB)`);
}
process.exit(0); // warn-only per ARCHITECTURE.md
