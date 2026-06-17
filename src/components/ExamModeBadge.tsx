/**
 * ExamModeBadge — fixed pill shown app-wide while Exam Mode is on (v2.5.0).
 *
 * Purpose is reassurance: during an exam that forbids AI, the operator wants
 * a constant, visible confirmation that the assistant is off. Rendered by the
 * (app) layout only when `exam_mode` is set. Server component — pure markup,
 * no client JS.
 */

import { Lock } from "lucide-react";

export function ExamModeBadge() {
  return (
    <div
      role="status"
      aria-label="Exam Mode active — AI assistant disabled"
      style={{
        position: "fixed",
        bottom: 12,
        left: 12,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 999,
        border: "1px solid var(--warning-border, #b45309)",
        background: "var(--warning-bg, rgba(180,83,9,0.14))",
        color: "var(--warning, #d97706)",
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.06em",
        pointerEvents: "none",
        backdropFilter: "blur(4px)",
      }}
    >
      <Lock size={11} />
      EXAM MODE · AI OFF
    </div>
  );
}
