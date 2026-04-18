import "server-only";

import type { KnowledgeBase } from "./loader";
import type { KbEntry } from "./schema";

/**
 * Port → KbEntry resolver implementing the D-04 fallback chain.
 *
 * Lookup order (D-04):
 *   1. exact `{port}-{service}` (aliases already fanned out at load time per D-05/D-08)
 *   2. port-only `{port}` (CD-04: no port-only files in v1.0, but supported for future)
 *   3. default entry via `kb.getDefault()`
 *
 * NEVER returns undefined (Success Criterion 3 / T-09).
 *
 * Case + Unicode (NFC) normalization is delegated to `KnowledgeBase.get()`,
 * which applies it symmetrically at index-build and lookup time (D-07/T-07).
 *
 * `import "server-only"` (T-06) prevents this file from being bundled into a
 * client component — KB internals stay server-side.
 */
export function matchPort(
  kb: KnowledgeBase,
  port: number,
  service: string | undefined,
): KbEntry {
  const svc = service?.trim() ?? "";

  // 1. exact {port}-{service}
  if (svc.length > 0) {
    const direct = kb.get(`${port}-${svc}`);
    if (direct) return direct;
  }

  // 2. {port}-only lookup (no port-only YAMLs ship in v1.0; future-friendly)
  const portOnly = kb.get(`${port}`);
  if (portOnly) return portOnly;

  // 3. default entry — never returns undefined (Success Criterion 3)
  return kb.getDefault();
}
