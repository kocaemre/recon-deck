"use client";

/**
 * Step 4 — AI assistant (v2.5.0).
 *
 * The opt-in AI co-pilot setup, slotted between Paths (3) and Updates (5).
 * Mirrors the project's privacy posture (OPS-03): the assistant is OFF by
 * default, local-first, and suggest-never-execute. Skipping or leaving the
 * master toggle off ships with no AI — exactly the pre-2.5.0 behaviour.
 *
 * Cloud providers (OpenAI / OpenRouter) send scan output off the host, so we
 * surface an explicit egress warning before any key is entered. Everything
 * here is re-editable later in /settings → AI assistant.
 */

import { Check, Cloud, HardDrive, Sparkles, TriangleAlert } from "lucide-react";
import {
  AI_PROVIDERS,
  AI_PROVIDER_ORDER,
  type AiProvider,
} from "@/lib/ai/providers";

export interface AiStepValue {
  aiEnabled: boolean;
  aiProvider: AiProvider;
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
}

export function AiStep({
  value,
  onChange,
}: {
  value: AiStepValue;
  onChange: (patch: Partial<AiStepValue>) => void;
}) {
  const preset = AI_PROVIDERS[value.aiProvider];
  const isCloud = preset.cloud;

  return (
    <div style={{ padding: "48px 56px", maxWidth: 760, margin: "0 auto" }}>
      <div
        className="mono uppercase tracking-[0.08em] font-medium"
        style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginBottom: 14 }}
      >
        STEP 04 / 05 · AI ASSISTANT
      </div>
      <h1
        className="font-semibold"
        style={{
          fontSize: 28,
          letterSpacing: "-0.02em",
          margin: "0 0 12px",
          color: "var(--fg)",
        }}
      >
        An optional co-pilot.
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--fg-muted)",
          margin: "0 0 24px",
          lineHeight: 1.6,
        }}
      >
        recon-deck can <span style={{ color: "var(--fg)" }}>explain</span> a
        finding and <span style={{ color: "var(--fg)" }}>suggest</span> next
        commands — grounded in your KB, and it only ever suggests, never runs
        anything. Like every network feature (
        <span className="mono" style={{ color: "var(--fg)" }}>
          OPS-03
        </span>
        ), it&apos;s off until you turn it on. Point it at a{" "}
        <span style={{ color: "var(--fg)" }}>local model</span> and nothing
        leaves your machine.
      </p>

      <EnableToggle
        checked={value.aiEnabled}
        onChange={(aiEnabled) => onChange({ aiEnabled })}
      />

      {value.aiEnabled && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 6,
            background: "var(--bg-1)",
            border: "1px solid var(--border)",
          }}
        >
          <FieldLabel>Provider</FieldLabel>
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              marginBottom: 16,
            }}
          >
            {AI_PROVIDER_ORDER.map((id) => (
              <ProviderCard
                key={id}
                id={id}
                active={value.aiProvider === id}
                onSelect={() =>
                  onChange({
                    aiProvider: id,
                    // Reset endpoint/model so the new preset's defaults apply
                    // (the inputs show them as placeholders). Key is kept.
                    aiBaseUrl: "",
                    aiModel: "",
                  })
                }
              />
            ))}
          </div>

          {isCloud && <CloudEgressWarning label={preset.label} />}

          {isCloud && (
            <div style={{ marginTop: 14 }}>
              <FieldLabel>API key</FieldLabel>
              <input
                type="password"
                value={value.aiApiKey}
                onChange={(e) => onChange({ aiApiKey: e.target.value })}
                placeholder="sk-…"
                autoComplete="off"
                spellCheck={false}
                className="mono"
                style={inputStyle}
              />
              <FieldHint>
                Stored locally in app_state. Required for {preset.label}; never
                shown again after you save.
              </FieldHint>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <FieldLabel>Base URL</FieldLabel>
            <input
              type="text"
              value={value.aiBaseUrl}
              onChange={(e) => onChange({ aiBaseUrl: e.target.value })}
              placeholder={preset.defaultBaseUrl}
              spellCheck={false}
              className="mono"
              style={inputStyle}
            />
            <FieldHint>
              OpenAI-compatible endpoint. Leave blank for the{" "}
              {preset.label} default.
            </FieldHint>
          </div>

          <div style={{ marginTop: 14 }}>
            <FieldLabel>Model</FieldLabel>
            <input
              type="text"
              value={value.aiModel}
              onChange={(e) => onChange({ aiModel: e.target.value })}
              placeholder={preset.defaultModel}
              spellCheck={false}
              className="mono"
              style={inputStyle}
            />
            <FieldHint>
              Leave blank for{" "}
              <span className="mono">{preset.defaultModel}</span>. Browse the
              full list with prices later in settings.
            </FieldHint>
          </div>
        </div>
      )}

      <ExamModeNote />
    </div>
  );
}

function EnableToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 6,
        background: "var(--bg-1)",
        border: `1px solid ${checked ? "var(--accent-border)" : "var(--border)"}`,
      }}
    >
      <label className="flex items-start" style={{ gap: 12, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
        />
        <span
          className="grid place-items-center"
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            flexShrink: 0,
            marginTop: 1,
            background: checked ? "var(--accent)" : "var(--bg-2)",
            border: `1px solid ${checked ? "var(--accent)" : "var(--border-strong)"}`,
            color: "#05170d",
          }}
        >
          {checked && <Check size={11} strokeWidth={3} />}
        </span>
        <div style={{ flex: 1 }}>
          <div
            className="flex items-center"
            style={{ gap: 7, fontWeight: 500, fontSize: 13.5 }}
          >
            <Sparkles size={13} style={{ color: "var(--accent)" }} />
            Enable AI assistant
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--fg-muted)",
              marginTop: 4,
              lineHeight: 1.55,
            }}
          >
            Off by default. When enabled, &quot;Explain&quot; and &quot;Suggest
            commands&quot; appear on port cards. Leave unchecked to ship with no
            AI at all.
          </div>
        </div>
      </label>
    </div>
  );
}

function ProviderCard({
  id,
  active,
  onSelect,
}: {
  id: AiProvider;
  active: boolean;
  onSelect: () => void;
}) {
  const preset = AI_PROVIDERS[id];
  const Icon = preset.cloud ? Cloud : HardDrive;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="text-left"
      style={{
        padding: "10px 12px",
        borderRadius: 5,
        background: active ? "var(--bg-3)" : "var(--bg-2)",
        border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
        boxShadow: active ? "0 0 0 1px var(--accent-border)" : "none",
        color: "var(--fg)",
        cursor: "pointer",
      }}
    >
      <div className="flex items-center" style={{ gap: 7 }}>
        <Icon
          size={13}
          style={{ color: active ? "var(--accent)" : "var(--fg-subtle)" }}
        />
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{preset.label}</span>
      </div>
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: preset.cloud ? "var(--risk-med)" : "var(--accent)",
          marginTop: 5,
        }}
      >
        {preset.cloud ? "cloud · egress" : "local · no egress"}
      </div>
    </button>
  );
}

function CloudEgressWarning({ label }: { label: string }) {
  return (
    <div
      className="flex items-start"
      style={{
        padding: 12,
        borderRadius: 6,
        background: "var(--risk-med-bg, var(--bg-2))",
        border: "1px solid var(--risk-med)",
        gap: 10,
      }}
    >
      <TriangleAlert
        size={14}
        style={{ color: "var(--risk-med)", flexShrink: 0, marginTop: 1 }}
      />
      <span style={{ fontSize: 12.5, color: "var(--fg)", lineHeight: 1.55 }}>
        <span style={{ fontWeight: 600 }}>{label} is a cloud provider.</span>{" "}
        Scan output (ports, banners, service versions) is sent to its API to
        generate explanations and suggestions. Prefer a local model if your
        engagement scope forbids that.
      </span>
    </div>
  );
}

function ExamModeNote() {
  return (
    <div
      className="flex items-start"
      style={{
        marginTop: 16,
        padding: 14,
        borderRadius: 6,
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
        gap: 10,
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 10,
          padding: "2px 7px",
          borderRadius: 3,
          background: "var(--bg-3)",
          border: "1px solid var(--border)",
          color: "var(--fg-muted)",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        EXAM
      </span>
      <span style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.55 }}>
        Sitting an OSCP-style exam? <span style={{ color: "var(--fg)" }}>Exam
        Mode</span> in{" "}
        <span className="mono" style={{ color: "var(--fg)" }}>
          /settings
        </span>{" "}
        hard-disables the AI with one toggle — your other tools, the internet,
        and HackTricks stay available. All of this is re-editable later in{" "}
        <span className="mono" style={{ color: "var(--fg)" }}>
          /settings → AI assistant
        </span>
        .
      </span>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mono uppercase tracking-[0.06em]"
      style={{ fontSize: 10, color: "var(--fg-subtle)", marginBottom: 6 }}
    >
      {children}
    </div>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11.5,
        color: "var(--fg-subtle)",
        marginTop: 6,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 5,
  background: "var(--bg-2)",
  border: "1px solid var(--border)",
  color: "var(--fg)",
  fontSize: 12.5,
  outline: "none",
};
