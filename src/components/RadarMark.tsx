/**
 * RadarMark — recon-deck identity mark.
 *
 * Static SVG (sweep wedge present but not animated) — radar dish with
 * concentric rings, crosshair, sweep wedge, and a few "contact" dots
 * representing detected ports. Phosphor-green palette via oklch.
 *
 * Used in the sidebar brand row (size=20). Larger variants (favicon,
 * social card, README hero) can render this same component at higher
 * sizes; viewBox is 0 0 130 130 so it scales cleanly.
 */
type Props = {
  size?: number;
  showCoords?: boolean;
  contactCount?: number;
  /** When true, the sweep wedge rotates via CSS keyframes. Default off. */
  sweep?: boolean;
  mode?: "dark" | "light";
};

export function RadarMark({
  size = 20,
  showCoords = false,
  contactCount = 2,
  sweep = false,
  mode = "dark",
}: Props) {
  const cx = 65;
  const cy = 65;
  const phos = "oklch(0.82 0.18 145)";
  const phosDeep = "oklch(0.62 0.16 145)";
  const tickColor = mode === "dark" ? phosDeep : "#1f3526";

  const allContacts = [
    { x: 84, y: 42, r: 3, kind: "open" as const },
    { x: 38, y: 78, r: 2.5, kind: "alt" as const },
    { x: 92, y: 88, r: 2, kind: "pulse" as const },
    { x: 46, y: 38, r: 2, kind: "open" as const },
    { x: 78, y: 96, r: 2, kind: "alt" as const },
  ];
  const contacts = allContacts.slice(0, contactCount);

  // Stable per-instance gradient ids so multiple <RadarMark>s on a page
  // (e.g. sidebar + a future hero) don't collide on `defs` references.
  const id = `rad-${size}-${contactCount}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 130 130"
      role="img"
      aria-label="recon-deck"
    >
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="50%" r="50%">
          <stop
            offset="0%"
            stopColor={phos}
            stopOpacity={mode === "dark" ? 0.18 : 0.12}
          />
          <stop offset="100%" stopColor={phos} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-sweep`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={phos} stopOpacity="0.55" />
          <stop offset="100%" stopColor={phos} stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r="58" fill={`url(#${id}-bg)`} />
      {[20, 38, 58].map((r) => (
        <circle
          key={r}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={tickColor}
          strokeOpacity={mode === "dark" ? 0.5 : 0.55}
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      ))}
      <line
        x1={cx}
        y1="6"
        x2={cx}
        y2="124"
        stroke={tickColor}
        strokeOpacity={mode === "dark" ? 0.4 : 0.45}
      />
      <line
        x1="6"
        y1={cy}
        x2="124"
        y2={cy}
        stroke={tickColor}
        strokeOpacity={mode === "dark" ? 0.4 : 0.45}
      />
      <g
        className={sweep ? "radar-sweep" : undefined}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      >
        <path
          d={`M ${cx} ${cy} L ${cx} 7 A 58 58 0 0 1 121 ${cy} Z`}
          fill={`url(#${id}-sweep)`}
        />
      </g>
      {contacts.map((c, i) => (
        <circle
          key={i}
          cx={c.x}
          cy={c.y}
          r={c.r}
          fill={c.kind === "alt" ? "oklch(0.82 0.16 78)" : phos}
        />
      ))}
      <circle cx={cx} cy={cy} r="3.5" fill={phos} />
      <circle cx={cx} cy={cy} r="1.5" fill={mode === "dark" ? "#0a0e0a" : "#0a1f12"} />
      {showCoords && (
        <g
          fontFamily="JetBrains Mono, ui-monospace, monospace"
          fontSize="7"
          fill={phosDeep}
          letterSpacing="0.08em"
        >
          <text x={cx} y="10" textAnchor="middle">
            N
          </text>
          <text x="123" y={cy + 2.5} textAnchor="end">
            E
          </text>
          <text x={cx} y="120" textAnchor="middle">
            S
          </text>
          <text x="6" y={cy + 2.5} textAnchor="start">
            W
          </text>
        </g>
      )}
    </svg>
  );
}
