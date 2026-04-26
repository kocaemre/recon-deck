"use client";

/**
 * KbValidator — paste-validate-save form for user KB entries.
 *
 * Posts the textarea content to `/api/kb/validate`. The route either
 * dry-runs (default) or saves to the user KB dir + invalidates the
 * cache. Server-side errors come back with a 422 + `issues[]` from
 * Zod when the payload parsed but failed schema validation; this
 * component surfaces them inline next to the textarea.
 *
 * No drizzle / fs imports — pure React island. The route enforces
 * the safety rules; the UI only formats output.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";

interface ValidatorIssue {
  path?: (string | number)[];
  message?: string;
}

interface EntrySummary {
  port: number;
  service: string;
  protocol: string;
  risk: string;
  aliases: string[];
  checkCount: number;
  commandCount: number;
  resourceCount: number;
  knownVulnCount: number;
}

interface KbValidatorProps {
  userDir: string | null;
}

const TEMPLATE = `# Paste a YAML KB entry. Schema: src/lib/kb/schema.ts
schema_version: 1
port: 80
service: http
protocol: tcp
aliases: []
risk: medium
checks:
  - key: http-dir-listing
    label: Confirmed directory listing is disabled
commands:
  - label: Banner grab
    template: curl -sI http://{IP}:{PORT}
resources:
  - title: HackTricks · HTTP
    url: https://book.hacktricks.xyz/network-services-pentesting/pentesting-web
known_vulns: []
`;

export function KbValidator({ userDir }: KbValidatorProps) {
  const [yaml, setYaml] = useState(TEMPLATE);
  const [filename, setFilename] = useState("custom-http");
  const [pending, setPending] = useState<"validate" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidatorIssue[]>([]);
  const [entry, setEntry] = useState<EntrySummary | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const canSave = useMemo(() => userDir != null, [userDir]);

  function resetFeedback() {
    setError(null);
    setIssues([]);
    setEntry(null);
    setSavedPath(null);
  }

  async function postValidate(save: boolean) {
    resetFeedback();
    setPending(save ? "save" : "validate");
    try {
      const res = await fetch("/api/kb/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yaml,
          save,
          filename: save ? filename : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `Request failed (${res.status}).`);
        if (Array.isArray(body.issues)) setIssues(body.issues);
        return;
      }
      if (body.entry) setEntry(body.entry);
      if (body.saved) {
        setSavedPath(body.path ?? null);
        toast.success("KB entry saved");
      } else {
        toast("KB entry valid");
      }
    } catch (err) {
      setError((err as Error).message ?? "Network error.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!canSave && (
        <div
          style={{
            padding: "10px 12px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: "var(--bg-1)",
            fontSize: 12,
            color: "var(--fg-muted)",
            lineHeight: 1.55,
          }}
        >
          Validation runs without configuration. To save entries here, set the{" "}
          <span className="mono" style={{ color: "var(--accent)" }}>
            RECON_KB_USER_DIR
          </span>{" "}
          environment variable and restart the dev server. Files written to
          that directory override shipped KB entries on a matching{" "}
          <span className="mono">{"{port}-{service}"}</span> key.
        </div>
      )}

      {canSave && (
        <div
          style={{
            padding: "10px 12px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: "var(--bg-1)",
            fontSize: 12,
            color: "var(--fg-muted)",
          }}
        >
          User KB dir:{" "}
          <span className="mono" style={{ color: "var(--accent)" }}>
            {userDir}
          </span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <label
          className="uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
        >
          Filename
        </label>
        <input
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          placeholder="custom-http"
          spellCheck={false}
          style={{
            flex: "0 0 220px",
            padding: "6px 10px",
            background: "var(--bg-1)",
            border: "1px solid var(--border)",
            borderRadius: 5,
            color: "var(--fg)",
            fontSize: 13,
            fontFamily: "var(--font-mono)",
          }}
        />
        <span
          style={{
            fontSize: 11,
            color: "var(--fg-faint)",
          }}
        >
          .yaml is appended automatically · letters/digits/underscore/hyphen
        </span>
      </div>

      <textarea
        value={yaml}
        onChange={(e) => setYaml(e.target.value)}
        spellCheck={false}
        style={{
          width: "100%",
          minHeight: 360,
          padding: "12px 14px",
          background: "var(--code-surface)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          color: "var(--fg)",
          fontFamily: "var(--font-mono)",
          fontSize: 12.5,
          lineHeight: 1.6,
          resize: "vertical",
        }}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => postValidate(false)}
          disabled={pending !== null || yaml.trim().length === 0}
          style={btnSecondary(pending !== null)}
        >
          {pending === "validate" ? "Validating…" : "Validate"}
        </button>
        <button
          type="button"
          onClick={() => postValidate(true)}
          disabled={
            pending !== null ||
            yaml.trim().length === 0 ||
            filename.trim().length === 0 ||
            !canSave
          }
          title={
            !canSave
              ? "Set RECON_KB_USER_DIR to enable save"
              : "Validate and save under the user KB dir"
          }
          style={btnPrimary(pending !== null || !canSave)}
        >
          {pending === "save" ? "Saving…" : "Validate & save"}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: "10px 12px",
            border: "1px solid var(--risk-crit)",
            borderRadius: 6,
            background: "var(--bg-1)",
            color: "var(--risk-crit)",
            fontSize: 12.5,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
          {issues.length > 0 && (
            <ul
              className="mono"
              style={{ margin: "8px 0 0", paddingLeft: 16, fontSize: 11.5 }}
            >
              {issues.map((iss, i) => (
                <li key={i}>
                  {(iss.path ?? []).join(".") || "(root)"}: {iss.message ?? "?"}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {entry && !error && (
        <div
          role="status"
          style={{
            padding: "10px 12px",
            border: "1px solid var(--accent-border, var(--border))",
            borderRadius: 6,
            background: "var(--bg-1)",
            fontSize: 12.5,
            color: "var(--fg-muted)",
            lineHeight: 1.6,
          }}
        >
          <div
            className="uppercase tracking-[0.08em] font-medium"
            style={{ fontSize: 10.5, color: "var(--accent)", marginBottom: 4 }}
          >
            {savedPath ? "Saved" : "Schema OK"}
          </div>
          <div className="mono" style={{ fontSize: 12 }}>
            {entry.port}/{entry.protocol} · {entry.service} · risk{" "}
            <span style={{ color: "var(--accent)" }}>{entry.risk}</span>
          </div>
          <div style={{ marginTop: 4 }}>
            {entry.checkCount} check{entry.checkCount === 1 ? "" : "s"} ·{" "}
            {entry.commandCount} command{entry.commandCount === 1 ? "" : "s"} ·{" "}
            {entry.resourceCount} resource
            {entry.resourceCount === 1 ? "" : "s"} ·{" "}
            {entry.knownVulnCount} known vuln
            {entry.knownVulnCount === 1 ? "" : "s"}
            {entry.aliases.length > 0 && (
              <>
                {" · aliases "}
                <span className="mono" style={{ color: "var(--fg)" }}>
                  {entry.aliases.join(", ")}
                </span>
              </>
            )}
          </div>
          {savedPath && (
            <div className="mono" style={{ marginTop: 6, color: "var(--fg-faint)", fontSize: 11 }}>
              {savedPath}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function btnSecondary(disabled: boolean): React.CSSProperties {
  return {
    height: 32,
    padding: "0 14px",
    borderRadius: 5,
    background: "var(--bg-2)",
    color: "var(--fg)",
    border: "1px solid var(--border)",
    fontSize: 12.5,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    height: 32,
    padding: "0 16px",
    borderRadius: 5,
    background: "var(--accent)",
    color: "#05170d",
    border: "1px solid var(--accent)",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}
