import { z } from "zod";

/**
 * KB Entry Zod schemas.
 *
 * Single source of truth for KB shape (REQ KB-02..KB-08, KB-11).
 *
 * Critical safety properties:
 * - `.strict()` on every object schema rejects unknown fields (REQ KB-08, T-03, T-04).
 *   In particular, `ResourceSchema.strict()` rejects `description`/`content`/`body`
 *   prose fields — KB is links-only, no copied prose (license hygiene).
 * - URL refine clamps `resources[].url` and `known_vulns[].link` to `https://` or
 *   `http://` schemes only (REQ KB-11, T-02). `z.string().url()` alone in Zod 4
 *   does NOT restrict scheme — the refine is mandatory.
 *
 * v2.4.0 P1 (#26): adds optional `conditional[]` array per entry. The `when`
 * DSL is data-only here — evaluation lands in P4. P1 just nails down the
 * shape so KB authors can start drafting and the lint can validate.
 *
 * See .planning/phases/01-knowledge-base-foundation/01-RESEARCH.md for rationale.
 */

const httpUrl = (message: string) =>
  z
    .string()
    .url()
    .refine(
      (u) => u.startsWith("https://") || u.startsWith("http://"),
      { message },
    );

export const RiskSchema = z.enum(["info", "low", "medium", "high", "critical"]);

export const ResourceSchema = z
  .object({
    title: z.string().min(1),
    url: httpUrl(
      "Resource URL must use https:// or http:// (per D-15 / KB-11)",
    ),
    author: z.string().optional(),
  })
  .strict();

export const CheckSchema = z
  .object({
    key: z.string().min(1), // stable check_key for Phase 3 persistence
    label: z.string().min(1),
  })
  .strict();

export const CommandSchema = z
  .object({
    /**
     * Optional stable identifier referenced by `conditional[].modifies_commands`
     * (v2.4.0 P1 #26). When omitted, the command can't be targeted by a
     * conditional rule — purely cosmetic in baseline rendering. Required
     * if any conditional in the same entry references it.
     */
    id: z.string().min(1).optional(),
    label: z.string().min(1),
    template: z.string().min(1),
  })
  .strict();

export const DefaultCredSchema = z
  .object({
    username: z.string(),
    password: z.string(),
    notes: z.string().optional(),
  })
  .strict();

export const KnownVulnSchema = z
  .object({
    match: z.string().min(1),
    note: z.string().min(1),
    link: httpUrl("known_vulns link must use https:// or http://"),
  })
  .strict();

/**
 * Conditional `when` DSL (v2.4.0 P1 #26).
 *
 * Discriminated union of predicates the resolver (P4) will evaluate against
 * fingerprints persisted by P2 (nmap) and P3 (AutoRecon). P1 only defines
 * the shape — no evaluation here. Recursive logical combinators (`anyOf`,
 * `allOf`, `not`) compose leaf predicates.
 *
 * Each leaf predicate documents which fingerprint source it consumes so
 * authors and reviewers can reason about which scan input is required for
 * the rule to ever fire.
 */
const NmapScriptContainsSchema = z
  .object({
    /** Predicate: NSE script id matched (e.g. `http-server-header`). */
    nmap_script_contains: z
      .object({
        /** NSE script id, e.g. `http-server-header`, `http-php-version`. */
        script: z.string().min(1),
        /** Substring searched against the script's output (case-insensitive in P4). */
        pattern: z.string().min(1),
      })
      .strict(),
  })
  .strict();

const NmapVersionMatchesSchema = z
  .object({
    /** Predicate: nmap version banner matched. */
    nmap_version_matches: z
      .object({
        /** Optional product substring filter (e.g. `vsftpd`). */
        product: z.string().min(1).optional(),
        /**
         * Optional version expression. P4 will support semver ranges
         * (`<= 2.3.5`, `>= 1.0.0 < 2.0.0`) and exact strings.
         */
        version: z.string().min(1).optional(),
      })
      .strict()
      .refine(
        (v) => v.product !== undefined || v.version !== undefined,
        {
          message:
            "nmap_version_matches needs at least one of product / version",
        },
      ),
  })
  .strict();

const AutoreconFindingSchema = z
  .object({
    /** Predicate: AutoRecon importer surfaced this fingerprint. */
    autorecon_finding: z
      .object({
        /** Bucket the fingerprint was stored under (`tech`, `cves`, `banners`). */
        type: z.enum(["tech", "cves", "banners"]),
        /** Exact value (case-insensitive in P4). */
        value: z.string().min(1),
      })
      .strict(),
  })
  .strict();

const PortFieldEqualsSchema = z
  .object({
    /** Predicate: a port-row field equals a value. Tight allowlist of fields. */
    port_field_equals: z
      .object({
        field: z.enum(["service", "product"]),
        value: z.string().min(1),
      })
      .strict(),
  })
  .strict();

type WhenExpr =
  | z.infer<typeof NmapScriptContainsSchema>
  | z.infer<typeof NmapVersionMatchesSchema>
  | z.infer<typeof AutoreconFindingSchema>
  | z.infer<typeof PortFieldEqualsSchema>
  | { anyOf: WhenExpr[] }
  | { allOf: WhenExpr[] }
  | { not: WhenExpr };

export const WhenExprSchema: z.ZodType<WhenExpr> = z.lazy(() =>
  z.union([
    NmapScriptContainsSchema,
    NmapVersionMatchesSchema,
    AutoreconFindingSchema,
    PortFieldEqualsSchema,
    z.object({ anyOf: z.array(WhenExprSchema).min(1) }).strict(),
    z.object({ allOf: z.array(WhenExprSchema).min(1) }).strict(),
    z.object({ not: WhenExprSchema }).strict(),
  ]),
);

export const CommandModificationSchema = z
  .object({
    /** Append the given string verbatim to the command template. */
    append: z.string().min(1).optional(),
    /** Swap the entire command template. Last-wins across multiple conditionals. */
    replace: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (v) => v.append !== undefined || v.replace !== undefined,
    { message: "command modification needs either append or replace" },
  );

export const ConditionalSchema = z
  .object({
    /** Stable identifier — unique within an entry's `conditional[]`. */
    id: z.string().min(1),
    when: WhenExprSchema,
    /** Checks added when the predicate matches. Keys must not collide with baseline. */
    adds_checks: z.array(CheckSchema).default([]),
    /** Mutations keyed by command `id`. Each id must reference a real `commands[].id`. */
    modifies_commands: z
      .record(z.string().min(1), CommandModificationSchema)
      .optional(),
  })
  .strict();

export const KbEntrySchema = z
  .object({
    schema_version: z.literal(1),
    port: z.number().int().min(0).max(65535),
    service: z.string().min(1),
    protocol: z.enum(["tcp", "udp"]).default("tcp"),
    aliases: z.array(z.string()).default([]),
    checks: z.array(CheckSchema).default([]),
    commands: z.array(CommandSchema).default([]),
    resources: z.array(ResourceSchema).default([]),
    risk: RiskSchema.default("info"),
    default_creds: z.array(DefaultCredSchema).optional(),
    quick_facts: z.array(z.string()).optional(),
    known_vulns: z.array(KnownVulnSchema).optional(),
    /** v2.4.0 P1 (#26) — fingerprint-driven conditional groups. */
    conditional: z.array(ConditionalSchema).optional(),
  })
  .strict();

export type KbEntry = z.infer<typeof KbEntrySchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type Check = z.infer<typeof CheckSchema>;
export type Command = z.infer<typeof CommandSchema>;
export type DefaultCred = z.infer<typeof DefaultCredSchema>;
export type KnownVuln = z.infer<typeof KnownVulnSchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type Conditional = z.infer<typeof ConditionalSchema>;
export type CommandModification = z.infer<typeof CommandModificationSchema>;
export type { WhenExpr };
