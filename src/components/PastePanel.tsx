"use client";

/**
 * PastePanel — client component for nmap paste input and submission.
 *
 * Primary interaction on the landing page: pentester pastes nmap output,
 * clicks "Start Engagement", and gets redirected to the engagement detail page.
 *
 * Per D-01: Minimal landing — centered textarea + button.
 * Per D-02: On success, redirect to /engagements/[id].
 * Per D-03: Parse errors show inline below the button (never navigate away).
 * Per UI-SPEC: Textarea 200px, button full-width, error text-destructive.
 * Per Copywriting Contract: Button "Start Engagement", placeholder exact copy.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function PastePanel() {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit() {
    if (!input.trim()) {
      setError("Input is empty. Paste nmap output to continue.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nmap: input }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(
          data.error ||
            "Could not parse this input. Paste raw nmap text output or XML (-oN / -oX).",
        );
        return;
      }

      const data = await res.json();
      router.push(`/engagements/${data.id}`);
    } catch {
      setError(
        "Could not parse this input. Paste raw nmap text output or XML (-oN / -oX).",
      );
    } finally {
      setLoading(false);
    }
  }

  /**
   * UI-10 sample loader. POSTs to /api/sample (empty body), awaits the
   * created engagement id, and navigates to its detail page. Shares state
   * with handleSubmit (loading, error) so both flows can't race the UI.
   * Repeated clicks create duplicate engagements — matches /api/scan and
   * Plan 07-03 Pitfall 9 / Open Decision #1.
   */
  async function handleSampleLoad() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/sample", { method: "POST" });
      if (!res.ok) {
        setError("Could not load sample engagement. Please try again.");
        return;
      }
      const data = await res.json();
      router.push(`/engagements/${data.id}`);
    } catch {
      setError("Could not load sample engagement. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[680px] px-8">
      {/* App name -- small, not competing with textarea focal point */}
      <h1 className="mb-2 text-2xl font-semibold text-foreground">
        recon-deck
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Paste nmap output. Get a checklist.
      </p>

      {/* Textarea -- primary focal point, 200px fixed height (UI-SPEC) */}
      <Textarea
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          if (error) setError(null);
        }}
        placeholder="Paste nmap output here (text or XML)..."
        className="h-[200px] resize-none bg-muted font-mono text-sm"
        disabled={loading}
      />

      {/* Submit button -- full width, disabled while empty or loading */}
      <Button
        onClick={handleSubmit}
        disabled={!input.trim() || loading}
        className="mt-4 w-full"
        size="lg"
      >
        {loading ? "Parsing..." : "Start Engagement"}
      </Button>

      {/* Error display -- inline below button, red text (D-03) */}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* "Try with sample" — UI-10 empty-state shortcut. Always rendered (no
          conditional based on input state) to avoid SSR/CSR hydration drift
          per Plan 07-03 Pitfall 6. Ghost variant so it reads as secondary to
          "Start Engagement". Disabled while either flow is loading. */}
      <div className="mt-6 text-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSampleLoad}
          disabled={loading}
        >
          {loading ? "Loading..." : "Try with sample"}
        </Button>
      </div>
    </div>
  );
}
