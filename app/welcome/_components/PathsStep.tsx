"use client";

/**
 * Step 3 — Local paths (v1.9.0).
 *
 * Three optional `PathField` rows with on-blur ✓/✗/· chips. The right
 * column shows a live `app_state` table preview that reflects the
 * current form state — empty fields render as `—`.
 */

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { validatePath } from "../_actions";
import type { OnboardingForm } from "./WelcomeFlow";

type Status = "ok" | "miss" | "empty" | "checking";

interface PathFieldDef {
  key: keyof Pick<
    OnboardingForm,
    "localExportDir" | "kbUserDir" | "wordlistBase"
  >;
  label: string;
  env: string;
  hint: string;
}

const FIELDS: PathFieldDef[] = [
  {
    key: "localExportDir",
    label: "Local export directory",
    env: "$RECON_LOCAL_EXPORT_DIR",
    hint: "Used by the opt-in vscode://file/… link on the engagement header.",
  },
  {
    key: "kbUserDir",
    label: "KB user directory",
    env: "$RECON_KB_USER_DIR",
    hint: "Drop your own YAML KB entries here — overrides the bundled ones by id.",
  },
  {
    key: "wordlistBase",
    label: "Wordlist base path",
    env: "(settings/wordlists)",
    hint: "SecLists / dirb root — interpolated as $WL in command templates.",
  },
];

export function PathsStep({
  form,
  onChange,
}: {
  form: OnboardingForm;
  onChange: (
    patch: Partial<
      Pick<OnboardingForm, "localExportDir" | "kbUserDir" | "wordlistBase">
    >,
  ) => void;
}) {
  const [statuses, setStatuses] = useState<Record<string, Status>>({
    localExportDir: "empty",
    kbUserDir: "empty",
    wordlistBase: "empty",
  });

  async function handleBlur(key: string, value: string) {
    setStatuses((prev) => ({ ...prev, [key]: "checking" }));
    const result = await validatePath(value);
    setStatuses((prev) => ({ ...prev, [key]: result }));
  }

  return (
    <div
      className="grid h-full"
      style={{ gridTemplateColumns: "1.05fr 1fr" }}
    >
      <div
        className="flex flex-col justify-center"
        style={{ padding: "44px 36px 28px 56px" }}
      >
        <div
          className="mono uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginBottom: 14 }}
        >
          STEP 03 / 04 · LOCAL PATHS
        </div>
        <h1
          className="font-semibold"
          style={{
            fontSize: 26,
            letterSpacing: "-0.02em",
            margin: "0 0 12px",
            color: "var(--fg)",
          }}
        >
          Tell recon-deck where things live.
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--fg-muted)",
            margin: "0 0 24px",
            maxWidth: 540,
            lineHeight: 1.6,
          }}
        >
          All fields are optional — leave them empty to keep defaults.
          Validation runs on blur:{" "}
          <span style={{ color: "var(--accent)" }}>✓ resolved</span> means
          recon-deck can read the path.
        </p>

        <div className="flex flex-col" style={{ gap: 16, maxWidth: 560 }}>
          {FIELDS.map((f) => (
            <PathField
              key={f.key}
              label={f.label}
              env={f.env}
              hint={f.hint}
              value={form[f.key]}
              status={statuses[f.key]}
              onChange={(v) => onChange({ [f.key]: v })}
              onBlur={(v) => handleBlur(f.key, v)}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          padding: "44px 56px 28px 28px",
          background: "var(--bg-1)",
          borderLeft: "1px solid var(--border)",
        }}
      >
        <div
          className="mono uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginBottom: 14 }}
        >
          WHERE THIS GOES
        </div>
        <p
          style={{
            fontSize: 13,
            color: "var(--fg-muted)",
            margin: "0 0 18px",
            lineHeight: 1.6,
          }}
        >
          recon-deck stores these in a new{" "}
          <span className="mono" style={{ color: "var(--fg)" }}>
            app_state
          </span>{" "}
          table. They survive container restarts and never leave the machine.
        </p>
        <pre
          className="mono"
          style={{
            margin: 0,
            padding: 14,
            borderRadius: 6,
            background: "var(--code)",
            border: "1px solid var(--border)",
            fontSize: 12,
            lineHeight: 1.7,
            color: "var(--fg-muted)",
            overflow: "auto",
          }}
        >
          <span style={{ color: "var(--fg-subtle)" }}>db ›</span>{" "}
          <span style={{ color: "var(--fg)" }}>app_state</span>
          {"\n"}
          <span style={{ color: "var(--fg-subtle)" }}>·</span> onboarded_at{"      "}
          <span style={{ color: "var(--accent)" }}>(at submit)</span>
          {"\n"}
          <span style={{ color: "var(--fg-subtle)" }}>·</span> local_export_dir{"  "}
          {form.localExportDir.trim() || "—"}
          {"\n"}
          <span style={{ color: "var(--fg-subtle)" }}>·</span> kb_user_dir{"       "}
          {form.kbUserDir.trim() || "—"}
          {"\n"}
          <span style={{ color: "var(--fg-subtle)" }}>·</span> wordlist_base{"     "}
          {form.wordlistBase.trim() || "—"}
          {"\n"}
          <span style={{ color: "var(--fg-subtle)" }}>·</span> update_check{"      "}
          <span style={{ color: "var(--fg-subtle)" }}>(set in next step)</span>
        </pre>
        <div
          className="mono"
          style={{
            marginTop: 12,
            fontSize: 11.5,
            color: "var(--fg-muted)",
            lineHeight: 1.55,
          }}
        >
          // note empty fields fall back to current default behaviour. You
          can edit any of this later under{" "}
          <span style={{ color: "var(--fg)" }}>/settings</span>.
        </div>
      </div>
    </div>
  );
}

function PathField({
  label,
  env,
  hint,
  value,
  status,
  onChange,
  onBlur,
}: {
  label: string;
  env: string;
  hint: string;
  value: string;
  status: Status;
  onChange: (v: string) => void;
  onBlur: (v: string) => void;
}) {
  const STATUS_STYLE: Record<
    Status,
    { color: string; text: string }
  > = {
    ok: { color: "var(--accent)", text: "resolved" },
    miss: { color: "var(--risk-high)", text: "not found" },
    empty: { color: "var(--fg-subtle)", text: "default" },
    checking: { color: "var(--fg-subtle)", text: "checking…" },
  };
  const st = STATUS_STYLE[status];

  return (
    <div className="flex flex-col" style={{ gap: 4 }}>
      <div className="flex items-center" style={{ gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
        <span
          className="mono"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
        >
          {env}
        </span>
        <span
          className="ml-auto inline-flex items-center"
          style={{ gap: 4, color: st.color }}
        >
          <span
            className="grid place-items-center"
            style={{ width: 12, height: 12 }}
          >
            {status === "ok" ? (
              <Check size={10} strokeWidth={3} />
            ) : status === "checking" ? (
              <Loader2 size={10} className="animate-spin" />
            ) : status === "miss" ? (
              "✗"
            ) : (
              "·"
            )}
          </span>
          <span className="mono" style={{ fontSize: 10.5 }}>
            {st.text}
          </span>
        </span>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onBlur(e.target.value)}
        placeholder="(optional)"
        className="mono"
        style={{
          padding: "8px 10px",
          borderRadius: 5,
          border: `1px solid ${status === "miss" ? "var(--risk-high)" : "var(--border)"}`,
          background: "var(--bg-0)",
          color: "var(--fg)",
          fontSize: 12.5,
          outline: "none",
          width: "100%",
        }}
      />
      <div
        style={{
          fontSize: 11.5,
          color: "var(--fg-muted)",
          lineHeight: 1.55,
          marginTop: 2,
        }}
      >
        {hint}
      </div>
    </div>
  );
}
