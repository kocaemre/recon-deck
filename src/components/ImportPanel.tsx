"use client";

/**
 * ImportPanel — client component for AutoRecon zip upload (Phase 5).
 *
 * Drop zone + click-to-browse UI for uploading an AutoRecon results/<ip>/
 * zip archive. Runs client-side size/type validation via react-dropzone,
 * POSTs the file as multipart/form-data to /api/import/autorecon, and
 * redirects to the created engagement on success.
 *
 * Per D-01: Positioned below PastePanel on the landing page, separated
 *          by an "or" divider.
 * Per D-02: On success, redirect to /engagements/[id] (same flow as paste).
 * Per D-03: Upload errors show inline below the drop zone.
 * Per D-11: 50 MB client-side + server-side size limit.
 * Per D-15: Simple spinner with step-based status text — no percentage bar.
 * Per UI-SPEC: Dashed drop zone, min-h-24, bg-muted; drag-active switches
 *              border/background to primary/muted-80; error state uses
 *              destructive border and inline error text with role="alert".
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// D-11: 50 MB client-side upload size limit.
const MAX_SIZE = 50 * 1024 * 1024;

export function ImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const router = useRouter();

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
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
    },
    [],
  );

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
    setStatus("Uploading...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      setStatus("Processing AutoRecon results...");
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
    } catch {
      setError("Failed to import AutoRecon results. Please try again.");
      setFile(null);
    } finally {
      setLoading(false);
      setStatus("");
    }
  }

  return (
    <div>
      {/* Drop zone */}
      <div
        {...getRootProps()}
        role="region"
        aria-label="AutoRecon zip file import"
        className={cn(
          "flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors duration-150 ease-in-out",
          isDragActive
            ? "border-primary bg-muted/80"
            : error
              ? "border-destructive bg-muted"
              : "border-border bg-muted",
          loading && "pointer-events-none opacity-60",
        )}
      >
        <input {...getInputProps()} />

        {file && !loading ? (
          /* File selected state */
          <div className="text-center">
            <p className="text-sm text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
        ) : loading ? (
          /* Uploading state */
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{status}</p>
          </div>
        ) : (
          /* Idle / drag states */
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-foreground">
              {isDragActive ? "Release to import" : "Drop AutoRecon zip here"}
            </p>
            <p className="text-xs text-muted-foreground">
              or click to browse · max 50 MB
            </p>
          </div>
        )}
      </div>

      {/* Import button — visible when file selected, not loading */}
      {file && !loading && (
        <Button
          onClick={handleUpload}
          className="mt-4 w-full"
          size="lg"
          disabled={loading}
        >
          Import AutoRecon Results
        </Button>
      )}

      {/* Error display — inline below drop zone (D-03) */}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Status text during upload — aria-live for screen readers */}
      {loading && status && (
        <p
          aria-live="polite"
          className="mt-2 text-center text-xs text-muted-foreground"
        >
          {status}
        </p>
      )}
    </div>
  );
}
