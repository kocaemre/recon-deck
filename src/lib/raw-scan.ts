export function getCopyableRawScanText(
  source: string,
  rawInput: string | null | undefined,
): string | null {
  if (source === "autorecon") return null;
  if (source !== "nmap-text" && source !== "nmap-xml") return null;
  if (!rawInput) return null;
  return rawInput;
}
