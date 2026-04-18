import "server-only";

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { KbEntrySchema, type KbEntry } from "./schema";

/**
 * Boot-time KB loader.
 *
 * Reads shipped YAMLs (hard-fail on invalid — D-18) and optional user YAMLs
 * (soft-fail per file — T-06), applies user-override full replacement on
 * matching `{port}-{service}` key (D-10), and builds an O(1) in-memory index
 * with alias fan-out (D-05/D-08).
 *
 * Service names are NFC-normalized + lowercased on both index build and lookup
 * (D-07/T-07) to defeat Unicode-homoglyph alias bypass.
 *
 * `import "server-only"` (T-06) makes the Next.js build fail if any client
 * component transitively imports this file — prevents leaking fs internals
 * and the user KB path into the client bundle.
 */

export interface KnowledgeBase {
  get(key: string): KbEntry | undefined;
  getDefault(): KbEntry;
  keys(): IterableIterator<string>;
}

function normalize(s: string): string {
  return s.normalize("NFC").toLowerCase();
}

function readYamlFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf8");
  return yaml.load(raw);
}

function indexKey(port: number, service: string): string {
  return `${port}-${normalize(service)}`;
}

export function loadKnowledgeBase(opts: {
  shippedPortsDir: string;
  shippedDefaultFile: string;
  userDir?: string;
}): KnowledgeBase {
  // 1. Default entry — hard failure on invalid (D-18 / shipped trust)
  const defaultEntry = KbEntrySchema.parse(readYamlFile(opts.shippedDefaultFile));

  // 2. Shipped entries — hard failure on invalid (D-18)
  const shipped: KbEntry[] = [];
  for (const file of fs.readdirSync(opts.shippedPortsDir)) {
    if (!file.endsWith(".yaml")) continue;
    const fp = path.join(opts.shippedPortsDir, file);
    shipped.push(KbEntrySchema.parse(readYamlFile(fp)));
  }

  // 3. User entries — soft failure per file (T-06), missing dir non-fatal (T-05)
  const user: KbEntry[] = [];
  if (opts.userDir && fs.existsSync(opts.userDir)) {
    for (const file of fs.readdirSync(opts.userDir)) {
      if (!file.endsWith(".yaml")) continue;
      const fp = path.join(opts.userDir, file);
      try {
        user.push(KbEntrySchema.parse(readYamlFile(fp)));
      } catch (err) {
        console.warn(`[kb] skipping invalid user file ${fp}: ${String(err)}`);
      }
    }
  }

  // 4. Merge — user wins on matching {port}-{service} key (D-10 full replacement)
  const byKey = new Map<string, KbEntry>();
  for (const e of shipped) byKey.set(indexKey(e.port, e.service), e);
  for (const e of user) byKey.set(indexKey(e.port, e.service), e);

  // 5. Build final index with alias fan-out (D-05/D-08)
  const map = new Map<string, KbEntry>();
  for (const e of byKey.values()) {
    map.set(indexKey(e.port, e.service), e);
    for (const alias of e.aliases) {
      map.set(indexKey(e.port, alias), e);
    }
  }

  return {
    get: (k) => map.get(normalize(k)),
    getDefault: () => defaultEntry,
    keys: () => map.keys(),
  };
}
