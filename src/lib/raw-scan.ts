interface RawScan {
  source: string;
  raw_input: string | null | undefined;
}

export function getCopyableRawScanText(
  original: RawScan,
  latest?: RawScan,
): string | null {
  // Older engagements may not have history. Never fall back to stale input
  // when a latest scan exists but cannot be copied.
  const { source, raw_input: rawInput } = latest ?? original;
  if (source === "autorecon") return null;
  if (source !== "nmap-text" && source !== "nmap-xml") return null;
  if (!rawInput) return null;
  return rawInput;
}
