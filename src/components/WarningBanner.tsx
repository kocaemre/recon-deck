"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WarningBannerProps {
  warnings: string[];
}

export function WarningBanner({ warnings }: WarningBannerProps) {
  const [visible, setVisible] = useState(true);

  if (!visible || warnings.length === 0) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3"
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0"
        style={{ color: "var(--risk-med)" }}
      />
      {/* Use the theme-flipping --risk-med token (#fbbf24 dark / #a16207 light)
          instead of a fixed amber-200, which was too faint on the light theme. */}
      <div className="flex-1 text-sm" style={{ color: "var(--risk-med)" }}>
        {warnings.map((w, i) => (
          <p key={i}>{w}</p>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setVisible(false)}
        aria-label="Dismiss warning"
        className="shrink-0"
        style={{ color: "var(--risk-med)" }}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
