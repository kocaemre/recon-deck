#!/usr/bin/env node
/**
 * Local production launcher for the `output: "standalone"` build.
 *
 * Beta-test B-3: `next start` prints
 *   ⚠ "next start" does not work with "output: standalone"
 * because Next.js wants you to run the self-contained server it emits under
 * `.next/standalone/`. That server, however, does NOT bundle `public/` or the
 * client `.next/static/` chunks — the Docker image copies them in, but a local
 * `node .next/standalone/server.js` would 404 every asset without this step.
 *
 * This mirrors what the Dockerfile does, cross-platform (fs.cpSync), then boots
 * the standalone server. Use it for a production-parity local run:
 *
 *   npm run build && npm run start:standalone
 *
 * `npm run dev` is still the everyday loop; `npm start` (plain `next start`)
 * keeps working too — it just emits the warning above.
 */

import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const standalone = join(root, ".next", "standalone");

if (!existsSync(join(standalone, "server.js"))) {
  console.error(
    'No standalone build found. Run "npm run build" first (next.config sets output: "standalone").',
  );
  process.exit(1);
}

// Copy the assets the standalone server expects but Next.js doesn't bundle.
for (const [from, to] of [
  [join(root, "public"), join(standalone, "public")],
  [join(root, ".next", "static"), join(standalone, ".next", "static")],
]) {
  if (existsSync(from)) cpSync(from, to, { recursive: true });
}

const port = process.env.PORT ?? process.env.RECON_DECK_PORT ?? "13337";
const child = spawn(process.execPath, [join(standalone, "server.js")], {
  stdio: "inherit",
  env: { ...process.env, PORT: port },
});
child.on("exit", (code) => process.exit(code ?? 0));
