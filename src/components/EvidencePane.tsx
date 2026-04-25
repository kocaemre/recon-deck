"use client";

/**
 * EvidencePane — per-port evidence gallery + uploader.
 *
 * Embedded inside PortDetailPane. Renders thumbnails for both
 * manually-uploaded screenshots and AutoRecon-imported gowitness/aquatone
 * images. Click a thumbnail to open a full-size lightbox modal.
 *
 * Upload paths:
 *   - Drag-and-drop onto the dashed zone
 *   - File-picker via "Add image" button
 *   - Clipboard paste (Ctrl/Cmd+V) while the pane is focused/hovered
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { PortEvidence } from "@/lib/db/schema";

interface EvidencePaneProps {
  engagementId: number;
  portId: number;
  evidence: PortEvidence[];
}

export function EvidencePane({
  engagementId,
  portId,
  evidence,
}: EvidencePaneProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [lightbox, setLightbox] = useState<PortEvidence | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  async function uploadFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are accepted.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("portId", String(portId));
      const res = await fetch(`/api/engagements/${engagementId}/evidence`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Upload failed.");
        return;
      }
      toast.success("Evidence added");
      router.refresh();
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // Clipboard paste handler — only fires when the pane is hovered to avoid
  // hijacking pastes elsewhere on the page (notes textarea, command copy, etc.).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let hovered = false;
    const onEnter = () => {
      hovered = true;
    };
    const onLeave = () => {
      hovered = false;
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!hovered) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (file) {
            e.preventDefault();
            void uploadFile(file);
            return;
          }
        }
      }
    };
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    document.addEventListener("paste", onPaste);
    return () => {
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("paste", onPaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagementId, portId]);

  async function onDelete(ev: PortEvidence) {
    if (
      !confirm(`Delete evidence "${ev.filename}"? This cannot be undone.`)
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/engagements/${engagementId}/evidence/${ev.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        toast.error("Delete failed.");
        return;
      }
      toast.success("Evidence removed");
      router.refresh();
    } catch {
      toast.error("Delete failed.");
    }
  }

  return (
    <div ref={containerRef}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void uploadFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1px dashed ${dragActive ? "var(--accent)" : "var(--border-strong)"}`,
          background: dragActive ? "var(--accent-bg)" : "var(--bg-1)",
          borderRadius: 5,
          padding: "10px 12px",
          textAlign: "center",
          cursor: uploading ? "not-allowed" : "pointer",
          color: "var(--fg-muted)",
          fontSize: 11.5,
          opacity: uploading ? 0.6 : 1,
          marginBottom: 8,
        }}
      >
        <Upload
          size={12}
          style={{
            display: "inline-block",
            marginRight: 6,
            verticalAlign: "middle",
            color: "var(--fg-subtle)",
          }}
        />
        {uploading
          ? "Uploading…"
          : dragActive
            ? "Release to upload"
            : "Drop, paste, or click to add a screenshot"}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadFile(f);
          // reset so the same file can be picked again
          e.currentTarget.value = "";
        }}
      />

      {evidence.length === 0 ? (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--fg-subtle)",
            fontStyle: "italic",
            padding: "8px 0",
          }}
        >
          No evidence yet.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: 6,
          }}
        >
          {evidence.map((ev) => (
            <div
              key={ev.id}
              style={{
                position: "relative",
                border: "1px solid var(--border)",
                borderRadius: 5,
                background: "var(--bg-2)",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => setLightbox(ev)}
                title={ev.filename}
                style={{
                  display: "block",
                  width: "100%",
                  padding: 0,
                  border: 0,
                  background: "transparent",
                  cursor: "zoom-in",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${ev.mime};base64,${ev.data_b64}`}
                  alt={ev.filename}
                  style={{
                    display: "block",
                    width: "100%",
                    aspectRatio: "16 / 10",
                    objectFit: "cover",
                  }}
                />
              </button>
              <div
                className="mono truncate"
                style={{
                  padding: "3px 6px",
                  fontSize: 10,
                  color: "var(--fg-subtle)",
                  borderTop: "1px solid var(--border)",
                  background: "var(--bg-1)",
                }}
              >
                {ev.source === "autorecon-import" ? "AR · " : ""}
                {ev.filename}
              </div>
              <button
                type="button"
                onClick={() => onDelete(ev)}
                title="Delete evidence"
                aria-label="Delete evidence"
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 18,
                  height: 18,
                  display: "grid",
                  placeItems: "center",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 3,
                  background: "rgba(0,0,0,0.55)",
                  color: "var(--risk-crit)",
                  cursor: "pointer",
                }}
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          role="dialog"
          aria-label="Evidence preview"
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(0,0,0,0.85)",
            display: "grid",
            placeItems: "center",
            cursor: "zoom-out",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "92vw", maxHeight: "90vh", position: "relative" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:${lightbox.mime};base64,${lightbox.data_b64}`}
              alt={lightbox.filename}
              style={{
                maxWidth: "92vw",
                maxHeight: "84vh",
                display: "block",
                border: "1px solid var(--border-strong)",
                borderRadius: 6,
              }}
            />
            <div
              className="mono"
              style={{
                marginTop: 8,
                color: "var(--fg-muted)",
                fontSize: 12,
                textAlign: "center",
              }}
            >
              {lightbox.filename}
              {lightbox.caption ? ` — ${lightbox.caption}` : ""}
            </div>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              aria-label="Close preview"
              style={{
                position: "absolute",
                top: -10,
                right: -10,
                width: 28,
                height: 28,
                display: "grid",
                placeItems: "center",
                border: "1px solid var(--border-strong)",
                borderRadius: "50%",
                background: "var(--bg-2)",
                color: "var(--fg)",
                cursor: "pointer",
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
