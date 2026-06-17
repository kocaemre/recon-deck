"use client";

/**
 * AiSettingsSection — the /settings "AI assistant" card (v2.5.0).
 *
 * One surface for the optional, local-first AI co-pilot plus the Exam Mode
 * override. Everything is opt-in and OFF by default. The API key is
 * write-only from the client's side: the existing key is never sent down
 * (only `hasKey`), and leaving the field blank on save keeps it.
 *
 * Exam Mode is wired separately and saves immediately — flipping it on
 * disables the AI config below and the app-wide badge appears at once.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Lock } from "lucide-react";
import {
  AI_PROVIDERS,
  AI_PROVIDER_ORDER,
  type AiProvider,
} from "@/lib/ai/providers";
import {
  setAiSettingsAction,
  setExamModeAction,
} from "../../app/(app)/settings/_actions";

export interface AiSettingsInitial {
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  examMode: boolean;
}

const card: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-2)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 4,
  padding: "7px 9px",
  borderRadius: 5,
  border: "1px solid var(--border)",
  background: "var(--bg-1)",
  color: "var(--fg)",
  fontSize: 12.5,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--fg-muted)",
};

export function AiSettingsSection({ initial }: { initial: AiSettingsInitial }) {
  const [examMode, setExamMode] = useState(initial.examMode);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [provider, setProvider] = useState<AiProvider>(initial.provider);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [model, setModel] = useState(initial.model);
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(initial.hasKey);
  const [clearKey, setClearKey] = useState(false);
  const [pending, startTransition] = useTransition();
  const [examPending, startExamTransition] = useTransition();
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsMsg, setModelsMsg] = useState<string | null>(null);

  async function loadModels() {
    setModelsLoading(true);
    setModelsMsg(null);
    try {
      const res = await fetch("/api/ai/models", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        models?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      const list = Array.isArray(json.models) ? json.models : [];
      setModels(list);
      setModelsMsg(
        list.length ? `${list.length} models loaded` : "No models returned",
      );
    } catch (e) {
      setModelsMsg(e instanceof Error ? e.message : "Could not load models");
    } finally {
      setModelsLoading(false);
    }
  }

  const preset = AI_PROVIDERS[provider];

  function toggleExam(next: boolean) {
    const prev = examMode;
    setExamMode(next);
    startExamTransition(async () => {
      try {
        await setExamModeAction(next);
        toast.success(next ? "Exam Mode on — AI disabled." : "Exam Mode off.");
      } catch {
        setExamMode(prev);
        toast.error("Could not update Exam Mode.");
      }
    });
  }

  function save() {
    startTransition(async () => {
      try {
        await setAiSettingsAction({
          enabled,
          provider,
          baseUrl,
          model,
          apiKey: clearKey ? null : apiKey || undefined,
        });
        if (clearKey) {
          setHasKey(false);
          setClearKey(false);
        } else if (apiKey.trim()) {
          setHasKey(true);
        }
        setApiKey("");
        toast.success("AI settings saved.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  const aiDisabled = examMode; // exam mode hard-disables the config below

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Exam Mode */}
      <div
        style={{
          ...card,
          borderColor: examMode ? "var(--warning-border, #b45309)" : "var(--border)",
          background: examMode ? "var(--warning-bg, rgba(180,83,9,0.12))" : "var(--bg-2)",
        }}
      >
        <label className="flex items-center gap-3" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={examMode}
            disabled={examPending}
            onChange={(e) => toggleExam(e.target.checked)}
            style={{ accentColor: "var(--warning, #d97706)" }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Lock size={13} /> Exam Mode
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.5 }}>
              Hard-disables the AI assistant — for exams that forbid AI (e.g.
              OSCP). Internet research, HackTricks links, and searchsploit stay
              available; only the AI is turned off.
            </div>
          </div>
        </label>
      </div>

      {/* AI config */}
      <div style={{ ...card, opacity: aiDisabled ? 0.55 : 1 }}>
        <label className="flex items-center gap-3" style={{ cursor: aiDisabled ? "not-allowed" : "pointer" }}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={aiDisabled || pending}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              Enable AI assistant
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.5 }}>
              Off by default. When on, defaults to a local model so nothing
              leaves your machine unless you pick a cloud provider below.
            </div>
          </div>
        </label>

        <div style={{ marginTop: 14, display: aiDisabled ? "none" : "block" }}>
          {/* Provider */}
          <div style={labelStyle}>PROVIDER</div>
          <div className="grid grid-cols-3 gap-2" style={{ marginTop: 6, marginBottom: 12 }}>
            {AI_PROVIDER_ORDER.map((p) => {
              const active = provider === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setProvider(p);
                    setModels([]);
                    setModelsMsg(null);
                  }}
                  disabled={pending}
                  style={{
                    padding: "8px 6px",
                    borderRadius: 6,
                    border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
                    background: active ? "var(--accent-bg)" : "var(--bg-1)",
                    color: active ? "var(--accent)" : "var(--fg-muted)",
                    fontSize: 11.5,
                    fontWeight: 500,
                    cursor: pending ? "wait" : "pointer",
                  }}
                >
                  {AI_PROVIDERS[p].label}
                </button>
              );
            })}
          </div>

          {preset.cloud && (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                padding: "8px 10px",
                marginBottom: 12,
                borderRadius: 5,
                border: "1px solid var(--warning-border, #b45309)",
                background: "var(--warning-bg, rgba(180,83,9,0.12))",
                fontSize: 11.5,
                color: "var(--fg-muted)",
                lineHeight: 1.5,
              }}
            >
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                <strong>Cloud provider.</strong> Anything the assistant sends
                (scan output, banners, notes) leaves your machine and goes to{" "}
                {preset.label}. Avoid on engagements with strict NDAs — prefer a
                local model.
              </span>
            </div>
          )}

          {/* Base URL */}
          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={labelStyle}>BASE URL</span>
            <input
              type="text"
              value={baseUrl}
              placeholder={preset.defaultBaseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={pending}
              spellCheck={false}
              style={inputStyle}
            />
          </label>

          {/* Model */}
          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={labelStyle}>MODEL</span>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <input
                type="text"
                list="ai-model-list"
                value={model}
                placeholder={preset.defaultModel}
                onChange={(e) => setModel(e.target.value)}
                disabled={pending}
                spellCheck={false}
                style={{ ...inputStyle, marginTop: 0, flex: 1 }}
              />
              <datalist id="ai-model-list">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <button
                type="button"
                onClick={loadModels}
                disabled={modelsLoading || pending}
                title="Fetch the provider's model list (uses the saved config)"
                style={{
                  flexShrink: 0,
                  padding: "0 12px",
                  borderRadius: 5,
                  border: "1px solid var(--border)",
                  background: "var(--bg-1)",
                  color: "var(--fg-muted)",
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: modelsLoading ? "wait" : "pointer",
                }}
              >
                {modelsLoading ? "Loading…" : "Load models"}
              </button>
            </div>
            {modelsMsg && (
              <div
                style={{
                  marginTop: 5,
                  fontSize: 10.5,
                  color: "var(--fg-subtle)",
                }}
              >
                {modelsMsg} · pick from the list or type a model id. Save the
                provider + key first if the list is empty.
              </div>
            )}
          </label>

          {/* API key */}
          <label style={{ display: "block", marginBottom: 8 }}>
            <span style={labelStyle}>
              API KEY {preset.needsKey ? "(required)" : "(not needed for local)"}
            </span>
            <input
              type="password"
              value={apiKey}
              placeholder={
                clearKey
                  ? "(will be cleared on save)"
                  : hasKey
                    ? "•••••••• (saved — leave blank to keep)"
                    : "sk-…"
              }
              onChange={(e) => {
                setApiKey(e.target.value);
                if (e.target.value) setClearKey(false);
              }}
              disabled={pending || clearKey}
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
            />
            {hasKey && !clearKey && (
              <button
                type="button"
                onClick={() => setClearKey(true)}
                disabled={pending}
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--fg-subtle)",
                  textDecoration: "underline",
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                  padding: 0,
                }}
              >
                Clear saved key
              </button>
            )}
          </label>

          <button
            type="button"
            onClick={save}
            disabled={pending}
            style={{
              marginTop: 6,
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid var(--accent-border)",
              background: "var(--accent-bg)",
              color: "var(--accent)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: pending ? "wait" : "pointer",
            }}
          >
            {pending ? "Saving…" : "Save AI settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
