import "server-only";

import fs from "node:fs";
import path from "node:path";

/**
 * Startup writability probe (PERSIST-06, D-03, D-04).
 *
 * Attempts write+read+delete of a sentinel file in the data directory.
 * On failure, writes an actionable error to stderr and exits with code 1.
 * No degraded mode -- fail fast so Docker logs show the root cause.
 *
 * Called from client.ts BEFORE new Database() to produce a clean error
 * instead of SQLite creating a zero-byte file that later fails on WAL.
 */
export function checkWritability(dir: string): void {
  const probe = path.join(dir, ".recon-deck-writable-probe");
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(probe, "ok");
    const content = fs.readFileSync(probe, "utf-8");
    if (content !== "ok") {
      throw new Error("Read-back mismatch");
    }
    fs.unlinkSync(probe);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[recon-deck] FATAL: Data directory not writable: ${msg}\n` +
        `  Path: ${dir}\n` +
        `  Fix:  chown 1000:1000 <host-path>  OR  use a named Docker volume\n`,
    );
    process.exit(1);
  }
}
