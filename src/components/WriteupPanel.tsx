"use client";

/**
 * WriteupPanel — collapsible plain-text writeup editor (v1.3.0 #9).
 *
 * Renders above the findings catalog on the engagement detail page.
 * Plain `<textarea>` for the first cut — markdown preview is deferred
 * until we have a concrete user ask. The body lands as a `## Writeup`
 * block at the top of the Markdown export, in `notes` for SysReptor,
 * and `executive_summary` for PwnDoc when non-empty.
 *
 * Saves via `PATCH /api/engagements/:id` debounced ~600ms after the last
 * keystroke. The Save button forces a flush; idle state shows "Saved"
 * once the latest revision is persisted.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { toast } from "sonner";

interface Props {
  engagementId: number;
  initialWriteup: string;
}

const SAVE_DEBOUNCE_MS = 600;

export function WriteupPanel({ engagementId, initialWriteup }: Props) {
  const router = useRouter();
  // Default expanded when there is already content; otherwise collapsed
  // so the panel doesn't dominate fresh engagements.
  const [open, setOpen] = useState(initialWriteup.length > 0);
  const [draft, setDraft] = useState(initialWriteup);
  const [savedAt, setSavedAt] = useState<number | null>(
    initialWriteup.length > 0 ? Date.now() : null,
  );
  const [pending, setPending] = useState(false);
  const lastSavedRef = useRef(initialWriteup);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = draft !== lastSavedRef.current;

  async function persist(value: string) {
    if (value === lastSavedRef.current) return;
    setPending(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ writeup: value }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(err.error ?? "Writeup save failed.");
        return;
      }
      lastSavedRef.current = value;
      setSavedAt(Date.now());
      router.refresh();
    } catch {
      toast.error("Writeup save failed.");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!dirty) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void persist(draft);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty]);

  const status = pending
    ? "Saving…"
    : dirty
      ? "Unsaved"
      : savedAt
        ? "Saved"
        : "";

  return (
    <section
      style={{
        margin: "16px 24px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg-1)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2"
        style={{
          width: "100%",
          padding: "10px 14px",
          background: "transparent",
          border: 0,
          color: "var(--fg)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {open ? (
          <ChevronDown size={14} style={{ color: "var(--fg-muted)" }} />
        ) : (
          <ChevronRight size={14} style={{ color: "var(--fg-muted)" }} />
        )}
        <FileText size={14} style={{ color: "var(--fg-muted)" }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Writeup</span>
        <span
          className="mono"
          style={{
            marginLeft: "auto",
            fontSize: 10.5,
            color: dirty ? "var(--risk-med)" : "var(--fg-faint)",
          }}
        >
          {status}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          <textarea
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            placeholder="Executive summary, narrative, findings rationale… plain text. Lands at the top of the Markdown export and in the SysReptor / PwnDoc notes field."
            spellCheck
            rows={10}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-0)",
              color: "var(--fg)",
              fontSize: 13,
              lineHeight: 1.5,
              fontFamily: "inherit",
              resize: "vertical",
              outline: "none",
            }}
          />
          <div
            className="flex items-center"
            style={{ marginTop: 8, gap: 8 }}
          >
            <span
              style={{ fontSize: 11, color: "var(--fg-faint)" }}
              className="mono"
            >
              {draft.length.toLocaleString()} chars · auto-saves{" "}
              {SAVE_DEBOUNCE_MS}ms after typing stops
            </span>
            <button
              type="button"
              onClick={() => void persist(draft)}
              disabled={!dirty || pending}
              style={{
                marginLeft: "auto",
                fontSize: 12,
                padding: "5px 12px",
                borderRadius: 5,
                border: "1px solid var(--border)",
                background: dirty ? "var(--accent)" : "transparent",
                color: dirty ? "#05170d" : "var(--fg-muted)",
                fontWeight: 500,
                cursor: dirty && !pending ? "pointer" : "default",
              }}
            >
              {pending ? "Saving…" : dirty ? "Save now" : "Saved"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
