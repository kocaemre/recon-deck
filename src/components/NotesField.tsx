"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
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
      <Textarea
        value={body}
        onChange={handleChange}
        placeholder="Add notes for this port..."
        className="min-h-[80px] max-h-[240px] resize-y bg-muted text-sm"
      />
      {/* Save status indicator — D-16 */}
      {saveStatus !== "idle" && (
        <p
          aria-live="polite"
          className={`mt-1 text-xs text-muted-foreground transition-opacity ${
            saveStatus === "saved" ? "opacity-70" : "opacity-100"
          }`}
        >
          {saveStatus === "saving" ? "Saving..." : "Saved"}
        </p>
      )}
    </div>
  );
}
