"use client";

import { Progress } from "@/components/ui/progress";

interface ProgressBarProps {
  total: number;
  done: number;
  portCount: number;
}

export function ProgressBar({ total, done, portCount }: ProgressBarProps) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="space-y-1">
      {/* 4px thin progress bar — D-17 */}
      <Progress
        value={percent}
        className="h-1"
        aria-label={`${percent}% coverage`}
      />
      {/* Stats text — UI-SPEC typography: 13px / 400 / muted-foreground */}
      <p className="text-xs text-muted-foreground">
        {portCount} {portCount === 1 ? "port" : "ports"} &middot;{" "}
        {done}/{total} checks &middot; {percent}% coverage
      </p>
    </div>
  );
}
