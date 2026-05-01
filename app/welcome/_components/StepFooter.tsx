"use client";

/**
 * StepFooter — persistent bottom chrome on every welcome step.
 *
 * Layout: Skip link on the left, Back + Next on the right.
 *   Step 1: no Back, primary "Take the tour" with ⏎ kbd
 *   Step 2: secondary "Continue"
 *   Step 3: secondary "Continue", Skip label is "Skip configuration…"
 *           (parent wires up the SkipDialog confirm)
 *   Step 4: primary "Land on first engagement" with ⏎ kbd
 */

import { ArrowLeft, ArrowRight, CornerDownLeft } from "lucide-react";

export function StepFooter({
  step,
  onBack,
  onNext,
  onSkip,
  nextLabel,
  skipLabel = "Skip onboarding",
  primary = false,
  pending = false,
  nextDisabled = false,
}: {
  step: 1 | 2 | 3 | 4;
  onBack?: () => void;
  onNext: () => void;
  onSkip: () => void;
  nextLabel: string;
  skipLabel?: string;
  primary?: boolean;
  pending?: boolean;
  nextDisabled?: boolean;
}) {
  return (
    <div
      className="flex items-center"
      style={{
        padding: "16px 28px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-1)",
        gap: 10,
      }}
    >
      <button
        type="button"
        onClick={onSkip}
        disabled={pending}
        style={{
          padding: "5px 10px",
          borderRadius: 5,
          background: "transparent",
          border: "1px solid transparent",
          color: "var(--fg-subtle)",
          fontSize: 12,
          cursor: pending ? "wait" : "pointer",
        }}
      >
        {skipLabel}
      </button>
      <div className="ml-auto flex items-center" style={{ gap: 8 }}>
        {step > 1 && (
          <button
            type="button"
            onClick={onBack}
            disabled={pending}
            className="inline-flex items-center"
            style={{
              gap: 6,
              padding: "5px 10px",
              borderRadius: 5,
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              color: "var(--fg-muted)",
              fontSize: 12,
              cursor: pending ? "wait" : "pointer",
            }}
          >
            <ArrowLeft size={11} />
            Back
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={pending || nextDisabled}
          className="inline-flex items-center"
          style={{
            gap: 6,
            padding: "6px 14px",
            borderRadius: 5,
            background: primary ? "var(--accent)" : "var(--bg-2)",
            border: `1px solid ${primary ? "var(--accent)" : "var(--border)"}`,
            color: primary ? "#05170d" : "var(--fg)",
            fontSize: 12,
            fontWeight: 600,
            cursor: pending || nextDisabled ? "not-allowed" : "pointer",
            opacity: nextDisabled ? 0.5 : 1,
          }}
        >
          {pending ? "…" : nextLabel}
          {primary ? (
            <span
              className="inline-flex items-center justify-center"
              style={{
                minWidth: 18,
                height: 16,
                padding: "0 4px",
                marginLeft: 4,
                borderRadius: 3,
                background: "rgba(0,0,0,0.18)",
                border: "1px solid rgba(0,0,0,0.25)",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
              }}
            >
              <CornerDownLeft size={10} />
            </span>
          ) : (
            <ArrowRight size={11} />
          )}
        </button>
      </div>
    </div>
  );
}
