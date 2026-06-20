"use client";

/**
 * AiErrorActions — error line + a one-click recovery for the Explain / Suggest
 * panels (beta-test #3 follow-up).
 *
 * On a provider error (most commonly a free-model 429) the panels used to just
 * print the message and leave the operator to go change the model by hand. When
 * the active provider is OpenRouter we now offer a single explicit button that
 * switches to the first curated RECOMMENDED model that isn't the current one
 * (a cheap, reliable paid model — the target is shown in the label, so it's
 * never a silent paid swap) and re-runs the request.
 *
 * Suggest-only stays suggest-only — this never runs anything against a target.
 */

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { RECOMMENDED_MODEL_IDS } from "@/lib/ai/providers";
import { useAiStatus, resetAiStatusCache } from "./useAiStatus";
import { setAiModelAction } from "../../../app/(app)/settings/_actions";

export function AiErrorActions({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  const status = useAiStatus();
  const [busy, setBusy] = useState(false);

  // Only offer a model swap on OpenRouter (where the curated list applies and
  // where free-tier 429s actually happen). Pick the first recommended id that
  // isn't already selected.
  const alt =
    status?.provider === "openrouter"
      ? RECOMMENDED_MODEL_IDS.find((m) => m !== status.model)
      : undefined;

  async function switchAndRetry() {
    if (!alt) return;
    setBusy(true);
    try {
      await setAiModelAction(alt);
      resetAiStatusCache(); // next status read reflects the new model
      onRetry();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--danger, #dc2626)" }}>{error}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          style={pillStyle}
        >
          <RefreshCw size={11} /> Retry
        </button>
        {alt && (
          <button
            type="button"
            onClick={switchAndRetry}
            disabled={busy}
            title={`Set the model to ${alt} and retry`}
            style={pillStyle}
          >
            {busy ? "Switching…" : `Switch to ${alt} & retry`}
          </button>
        )}
      </div>
    </div>
  );
}

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 9px",
  borderRadius: 5,
  border: "1px solid var(--border)",
  background: "var(--bg-2)",
  color: "var(--fg-muted)",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};
