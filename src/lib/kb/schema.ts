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
  })
  .strict();

export type KbEntry = z.infer<typeof KbEntrySchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type Check = z.infer<typeof CheckSchema>;
export type Command = z.infer<typeof CommandSchema>;
export type DefaultCred = z.infer<typeof DefaultCredSchema>;
export type KnownVuln = z.infer<typeof KnownVulnSchema>;
export type Risk = z.infer<typeof RiskSchema>;
