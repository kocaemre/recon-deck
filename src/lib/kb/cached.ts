import "server-only";

/**
 * Cached KnowledgeBase singleton with filesystem-watched invalidation.
 *
 * Problem this fixes: previously every consumer called
 * `loadKnowledgeBase(...)` at module scope, baking the KB into the
 * process for its entire lifetime. Editing a user YAML required a dev-
 * server restart for the change to surface. With this module, all
 * consumers go through `getKb()`; on cold start it loads + caches; an
 * `fs.watch` on the shipped + user directories flips a "dirty" flag so
 * the next `getKb()` call rebuilds.
 *
 * Why a flag instead of rebuilding inside the watch callback: bursts
 * of editor "save" events fire many `change` callbacks for one logical
 * write. Coalescing into a single rebuild on next read is both cheaper
 * and avoids serving a half-written file. The trade-off is a one-call
 * latency hit after an edit (~10 ms on the shipped KB), which is
 * imperceptible inside a request.
 *
 * Manual invalidation hook (`invalidateKb`) is exposed for the
 * `/api/kb/validate` write path: after a successful save, the route
 * calls invalidateKb so the operator's own request immediately sees
 * their new entry without depending on the watcher.
 */

import fs from "node:fs";
import path from "node:path";
import { loadKnowledgeBase, type KnowledgeBase } from "./loader";

interface KbDirs {
  shippedPortsDir: string;
  shippedDefaultFile: string;
  userDir?: string;
}

let cached: KnowledgeBase | null = null;
let watchersInstalled = false;
let dirty = false;
let dirsForReload: KbDirs | null = null;

function defaultDirs(): KbDirs {
  return {
    shippedPortsDir: path.join(process.cwd(), "knowledge", "ports"),
    shippedDefaultFile: path.join(process.cwd(), "knowledge", "default.yaml"),
    userDir: process.env.RECON_KB_USER_DIR ?? undefined,
  };
}

function installWatchers(dirs: KbDirs): void {
  if (watchersInstalled) return;
  // Watching the parent dir of each YAML target gives us add/rename
  // coverage that watching individual files cannot. Recursive option is
  // a no-op on linux-mainline but harmless when set; macOS / windows
  // honor it. Node 18+ tolerates non-recursive on linux for this scope.
  const watchTargets: string[] = [];
  if (fs.existsSync(dirs.shippedPortsDir)) watchTargets.push(dirs.shippedPortsDir);
  // Watch the directory that holds default.yaml — not the file itself —
  // so atomic-rename editors (vim's `:w`) keep firing events.
  const defaultDir = path.dirname(dirs.shippedDefaultFile);
  if (fs.existsSync(defaultDir) && !watchTargets.includes(defaultDir)) {
    watchTargets.push(defaultDir);
  }
  if (dirs.userDir && fs.existsSync(dirs.userDir)) {
    watchTargets.push(dirs.userDir);
  }
  for (const target of watchTargets) {
    try {
      const w = fs.watch(target, { persistent: false }, (_event, filename) => {
        if (typeof filename === "string" && !filename.endsWith(".yaml")) return;
        dirty = true;
      });
      // Don't keep the event loop alive solely for this watcher.
      w.unref?.();
    } catch (err) {
      console.warn(
        `[kb] failed to install watcher on ${target}; hot reload disabled for this path:`,
        err,
      );
    }
  }
  watchersInstalled = true;
}

/**
 * Return the cached KnowledgeBase, rebuilding it if a watched directory
 * has changed since the last call. The first invocation seeds the
 * cache and installs the watchers — subsequent invocations are O(1)
 * pointer reads on the happy path.
 *
 * Pass overrides only from places that need a non-default layout
 * (mostly `/api/kb/validate` operating on a temp dir for dry-run
 * loads). Production callers pass nothing.
 */
export function getKb(overrideDirs?: KbDirs): KnowledgeBase {
  if (overrideDirs) {
    // Override callers always want a fresh load; bypass cache entirely.
    return loadKnowledgeBase(overrideDirs);
  }
  if (!dirsForReload) dirsForReload = defaultDirs();
  if (!cached || dirty) {
    cached = loadKnowledgeBase(dirsForReload);
    dirty = false;
    installWatchers(dirsForReload);
  }
  return cached;
}

/**
 * Force the next `getKb()` call to rebuild. Wired into the
 * `/api/kb/validate` save path so the operator's request sees their
 * own new entry without waiting for the fs.watch event to land.
 */
export function invalidateKb(): void {
  dirty = true;
}

/**
 * Test-only escape hatch: drop the cache + watcher state so unit tests
 * can drive `getKb()` against successive temp directories without
 * leaking state across cases. Production code never calls this.
 */
export function __resetKbCacheForTests(): void {
  cached = null;
  dirty = false;
  watchersInstalled = false;
  dirsForReload = null;
}
