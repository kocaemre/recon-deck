"use client";

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CopyButtonProps {
  text: string;
  /** First 30 chars for aria-label */
  label?: string;
}

export function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast("Command copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed — check browser permissions.");
    }
  }, [text]);

  const ariaLabel = label
    ? `Copy command: ${label.slice(0, 30)}`
    : "Copy command";

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      aria-label={ariaLabel}
      className="min-h-11 shrink-0 gap-1.5"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-green-500" />
          <span className="text-xs text-green-500">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          <span className="text-xs">Copy</span>
        </>
      )}
    </Button>
  );
}
