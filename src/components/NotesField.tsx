"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { saveNote } from "../../app/engagements/[id]/actions";
import { toast } from "sonner";

interface NotesFieldProps {
  engagementId: number;
  portId: number;
  initialBody: string;
}

export function NotesField({
  engagementId,
  portId,
  initialBody,
}: NotesFieldProps) {
  const [body, setBody] = useState(initialBody);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved"
  >("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cleanup debounce timers on unmount (RESEARCH Pitfall 5)
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  const debouncedSave = useCallback(
    (newBody: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

      timerRef.current = setTimeout(async () => {
        setSaveStatus("saving");
        try {
          await saveNote(engagementId, portId, newBody);
          setSaveStatus("saved");
          fadeTimerRef.current = setTimeout(
            () => setSaveStatus("idle"),
            1500,
          );
        } catch {
          setSaveStatus("idle");
          toast.error("Note save failed — check storage.");
        }
      }, 600); // 600ms debounce per CD-05 / UI-SPEC
    },
    [engagementId, portId],
  );

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newBody = e.target.value;
    setBody(newBody);
    debouncedSave(newBody);
  }

  return (
    <div>
      <textarea
        value={body}
        onChange={handleChange}
        placeholder="No notes yet."
        className="mono w-full resize-y placeholder:italic placeholder:text-[var(--fg-subtle)]"
        style={{
          minHeight: 60,
          maxHeight: 240,
          padding: 10,
          background: "var(--bg-1)",
          border: "1px solid var(--border)",
          borderRadius: 5,
          color: "var(--fg)",
          fontSize: 12.5,
          lineHeight: 1.55,
          outline: "none",
          fontFamily: "var(--font-ui)",
        }}
      />
      {/* Save status indicator — D-16 */}
      {saveStatus !== "idle" && (
        <p
          aria-live="polite"
          className={`mt-1 transition-opacity ${
            saveStatus === "saved" ? "opacity-70" : "opacity-100"
          }`}
          style={{ fontSize: 11, color: "var(--fg-muted)" }}
        >
          {saveStatus === "saving" ? "Saving…" : "Saved"}
        </p>
      )}
    </div>
  );
}
