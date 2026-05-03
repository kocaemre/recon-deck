"use client";

/**
 * ImportPanel — AutoRecon zip drop zone (redesigned).
 *
 * Dashed-border drop zone styled from the new token set. Preserves the
 * existing upload flow, 50 MB client-side limit, aria-live status, and
 * error handling from the previous implementation.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload, Loader2 } from "lucide-react";

const MAX_SIZE = 50 * 1024 * 1024;

export function ImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const router = useRouter();

  const onDrop = useCallback((accepted: File[], rejected: FileRejection[]) => {
    setError(null);
    if (rejected.length > 0) {
      const code = rejected[0].errors[0]?.code;
      if (code === "file-too-large") {
        setError(
          "File too large — maximum 50 MB. Try reducing the zip contents.",
        );
      } else {
        setError(
          "Only .zip files are accepted. Zip your AutoRecon results/<ip>/ folder first.",
        );
      }
      return;
    }
    setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/zip": [".zip"] },
    maxFiles: 1,
    maxSize: MAX_SIZE,
    onDrop,
    disabled: loading,
  });

  async function handleUpload() {
    if (!file) return;
    setError(null);
    setLoading(true);
    setStatus("Uploading…");
    try {
      const formData = new FormData();
      formData.append("file", file);
      setStatus("Processing AutoRecon results…");
      const res = await fetch("/api/import/autorecon", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to import AutoRecon results.");
        setFile(null);
        return;
      }
      const data = await res.json();
      router.push(`/engagements/${data.id}`);
      router.refresh();
    } catch {
      setError("Failed to import AutoRecon results. Please try again.");
      setFile(null);
    } finally {
      setLoading(false);
      setStatus("");
    }
  }

  const dropBorder = error
    ? "var(--risk-crit)"
    : isDragActive
      ? "var(--accent)"
      : "var(--border-strong)";
  const dropBg = isDragActive ? "var(--accent-bg)" : "var(--bg-1)";

  return (
    <div>
      <div
        {...getRootProps()}
        role="region"
        aria-label="AutoRecon zip file import"
        style={{
          border: `1px dashed ${dropBorder}`,
          borderRadius: 8,
          padding: 18,
          textAlign: "center",
          background: dropBg,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
          transition: "background 120ms ease, border-color 120ms ease",
        }}
      >
        <input {...getInputProps()} />

        {file && !loading ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{file.name}</div>
            <div
              style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 4 }}
            >
              {(file.size / 1024 / 1024).toFixed(1)} MB — click Import below
            </div>
          </>
        ) : loading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2
              size={16}
              className="animate-spin"
              style={{ color: "var(--fg-muted)" }}
            />
            <p style={{ fontSize: 12, color: "var(--fg-muted)" }}>{status}</p>
          </div>
        ) : (
          <>
            <div
              className="inline-flex items-center justify-center gap-2"
              style={{ fontSize: 13, fontWeight: 500 }}
            >
              <Upload size={14} style={{ color: "var(--fg-muted)" }} />
              {isDragActive ? (
                "Release to import"
              ) : (
                <span>
                  Drop an AutoRecon{" "}
                  <span className="mono">results.zip</span>
                </span>
              )}
            </div>
            <div
              style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 4 }}
            >
              Parsed server-side, no client-side unpacking.
            </div>
          </>
        )}
      </div>

      {file && !loading && (
        <button
          type="button"
          onClick={handleUpload}
          className="mt-3 flex w-full items-center justify-center"
          style={{
            height: 36,
            padding: "0 14px",
            borderRadius: 5,
            background: "var(--bg-2)",
            color: "var(--fg)",
            border: "1px solid var(--border)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Import AutoRecon Results
        </button>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3"
          style={{ fontSize: 12.5, color: "var(--risk-crit)" }}
        >
          {error}
        </p>
      )}

      {loading && status && (
        <p
          aria-live="polite"
          className="mt-2 text-center"
          style={{ fontSize: 11.5, color: "var(--fg-muted)" }}
        >
          {status}
        </p>
      )}
    </div>
  );
}
