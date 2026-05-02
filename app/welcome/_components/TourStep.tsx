"use client";

/**
 * Step 2 — Tour (v1.9.0).
 *
 * Two-pane: left rail (4 hover-selectable surface entries), right grid
 * (2x2 of mini-component previews). Hovering or clicking either side
 * keeps both in sync via shared `active` state.
 */

import { useState } from "react";

const SURFACES = [
  {
    idx: "01",
    name: "Paste panel",
    kbd: "1",
    desc: "Landing surface. nmap text/XML or AutoRecon zip.",
  },
  {
    idx: "02",
    name: "Engagement detail",
    kbd: "2",
    desc: "Heatmap of open ports, click any tile for commands / checks / notes / evidence.",
  },
  {
    idx: "03",
    name: "Settings",
    kbd: "3",
    desc: "KB editor, recycle bin, editor integration, wordlists.",
  },
  {
    idx: "04",
    name: "Command palette",
    kbd: "⌘K",
    desc: "Jump anywhere. Toggle a check. Run a command. ? for the cheat sheet.",
  },
] as const;

type SurfaceIdx = (typeof SURFACES)[number]["idx"];

export function TourStep() {
  const [active, setActive] = useState<SurfaceIdx>("01");

  return (
    <div
      className="grid h-full"
      style={{ gridTemplateColumns: "320px 1fr" }}
    >
      <div
        className="flex flex-col"
        style={{
          padding: "44px 28px 28px 56px",
          borderRight: "1px solid var(--border)",
        }}
      >
        <div
          className="mono uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginBottom: 14 }}
        >
          STEP 02 / 04 · TOUR
        </div>
        <h1
          className="font-semibold"
          style={{
            fontSize: 26,
            letterSpacing: "-0.02em",
            margin: "0 0 12px",
            color: "var(--fg)",
          }}
        >
          Four surfaces.
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--fg-muted)",
            margin: "0 0 20px",
            lineHeight: 1.6,
          }}
        >
          Hover any card to focus it. They&apos;re real components rendered
          with sample data — not screenshots.
        </p>
        <div className="flex flex-col" style={{ gap: 6 }}>
          {SURFACES.map((s) => {
            const isActive = active === s.idx;
            return (
              <button
                key={s.idx}
                type="button"
                onMouseEnter={() => setActive(s.idx)}
                onClick={() => setActive(s.idx)}
                className="text-left"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 5,
                  background: isActive ? "var(--bg-3)" : "var(--bg-1)",
                  border: `1px solid ${isActive ? "var(--accent-border)" : "var(--border)"}`,
                  color: "var(--fg)",
                  cursor: "pointer",
                }}
              >
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span
                    className="mono"
                    style={{
                      fontSize: 10.5,
                      color: isActive ? "var(--accent)" : "var(--fg-subtle)",
                      width: 18,
                    }}
                  >
                    {s.idx}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</span>
                  <span
                    className="mono ml-auto"
                    style={{
                      padding: "1px 6px",
                      borderRadius: 3,
                      background: "var(--bg-2)",
                      border: "1px solid var(--border)",
                      fontSize: 10,
                      color: "var(--fg-muted)",
                    }}
                  >
                    {s.kbd}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--fg-muted)",
                    lineHeight: 1.55,
                    marginTop: 4,
                    paddingLeft: 26,
                  }}
                >
                  {s.desc}
                </div>
              </button>
            );
          })}
        </div>
        <div
          className="mono"
          style={{
            marginTop: "auto",
            padding: "8px 10px",
            border: "1px dashed var(--border)",
            borderRadius: 5,
            fontSize: 10.5,
            color: "var(--fg-muted)",
            lineHeight: 1.55,
          }}
        >
          {"// "}tip — press <span style={{ color: "var(--fg)" }}>?</span> anywhere
          for the cheat sheet · <span style={{ color: "var(--fg)" }}>⌘K</span>{" "}
          opens the palette
        </div>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: 14,
          padding: "44px 56px 28px 36px",
        }}
      >
        <SurfaceCard
          idx="01"
          name="Paste panel"
          kbd="1"
          active={active === "01"}
          onHover={() => setActive("01")}
        >
          <MiniPaste />
        </SurfaceCard>
        <SurfaceCard
          idx="02"
          name="Engagement detail"
          kbd="2"
          active={active === "02"}
          onHover={() => setActive("02")}
        >
          <MiniHeatmap />
        </SurfaceCard>
        <SurfaceCard
          idx="03"
          name="Settings"
          kbd="3"
          active={active === "03"}
          onHover={() => setActive("03")}
        >
          <MiniSettings />
        </SurfaceCard>
        <SurfaceCard
          idx="04"
          name="Command palette"
          kbd="⌘K"
          active={active === "04"}
          onHover={() => setActive("04")}
        >
          <MiniPalette />
        </SurfaceCard>
      </div>
    </div>
  );
}

function SurfaceCard({
  idx,
  name,
  kbd,
  active,
  onHover,
  children,
}: {
  idx: string;
  name: string;
  kbd: string;
  active: boolean;
  onHover: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onMouseEnter={onHover}
      style={{
        border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
        background: active ? "var(--bg-1)" : "var(--bg-2)",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: active ? "0 0 0 1px var(--accent-border)" : "none",
        transition: "border-color 120ms, box-shadow 120ms",
        cursor: "pointer",
      }}
    >
      <div
        className="flex items-center"
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-1)",
          gap: 8,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 10.5,
            color: active ? "var(--accent)" : "var(--fg-subtle)",
          }}
        >
          {idx}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{name}</span>
        <span
          className="mono ml-auto"
          style={{
            padding: "1px 6px",
            borderRadius: 3,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            fontSize: 10,
            color: "var(--fg-muted)",
          }}
        >
          {kbd}
        </span>
      </div>
      <div
        style={{
          height: 168,
          background: "var(--bg-0)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function MiniPaste() {
  return (
    <div style={{ padding: 12, height: "100%" }}>
      <div
        className="mono"
        style={{ fontSize: 10, color: "var(--fg-subtle)", marginBottom: 6 }}
      >
        ~/scans/lame.txt
      </div>
      <pre
        className="mono"
        style={{
          margin: 0,
          padding: "8px 10px",
          fontSize: 9.5,
          lineHeight: 1.55,
          color: "var(--fg-muted)",
          background: "var(--code)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          height: 96,
          overflow: "hidden",
        }}
      >
        {`PORT     STATE SERVICE     VERSION
21/tcp   open  ftp         vsftpd 2.3.4
22/tcp   open  ssh         OpenSSH 4.7p1
139/tcp  open  netbios-ssn Samba 3.X
445/tcp  open  netbios-ssn Samba 3.0.20
3632/tcp open  distccd     v1`}
      </pre>
      <div className="flex" style={{ gap: 6, marginTop: 8 }}>
        <span
          className="mono"
          style={{
            fontSize: 9.5,
            padding: "1px 6px",
            borderRadius: 3,
            background: "var(--accent-bg)",
            border: "1px solid var(--accent-border)",
            color: "var(--accent)",
          }}
        >
          parseable
        </span>
        <span
          className="mono"
          style={{
            fontSize: 9.5,
            padding: "1px 6px",
            borderRadius: 3,
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            color: "var(--fg-muted)",
          }}
        >
          5 ports
        </span>
      </div>
    </div>
  );
}

function MiniHeatmap() {
  const ports: Array<{ p: number; r: string }> = [
    { p: 21, r: "crit" },
    { p: 22, r: "med" },
    { p: 80, r: "high" },
    { p: 111, r: "low" },
    { p: 139, r: "crit" },
    { p: 443, r: "high" },
    { p: 445, r: "crit" },
    { p: 512, r: "med" },
    { p: 513, r: "low" },
    { p: 514, r: "low" },
    { p: 1099, r: "med" },
    { p: 1524, r: "info" },
    { p: 2049, r: "high" },
    { p: 2121, r: "med" },
    { p: 3306, r: "high" },
    { p: 3632, r: "high" },
    { p: 5432, r: "high" },
    { p: 5900, r: "med" },
    { p: 6000, r: "low" },
    { p: 6667, r: "info" },
    { p: 8009, r: "med" },
    { p: 8180, r: "med" },
  ];
  const RISK_VAR: Record<string, string> = {
    crit: "var(--risk-crit)",
    high: "var(--risk-high)",
    med: "var(--risk-med)",
    low: "var(--risk-low)",
    info: "var(--risk-info)",
  };
  return (
    <div style={{ padding: 12 }}>
      <div
        className="flex items-center"
        style={{
          marginBottom: 8,
          fontSize: 10,
          color: "var(--fg-subtle)",
          gap: 6,
        }}
      >
        <span className="mono">10.10.10.3</span>
        <span className="mono ml-auto">22 open</span>
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}
      >
        {ports.map((p, i) => {
          const selected = i === 4;
          return (
            <div
              key={i}
              className="mono"
              style={{
                fontSize: 9.5,
                padding: "5px 6px",
                borderRadius: 3,
                background: selected ? "var(--bg-3)" : "var(--bg-2)",
                border: `1px solid ${selected ? "var(--accent-border)" : "var(--border)"}`,
                color: "var(--fg-muted)",
                boxShadow: selected ? "0 0 0 1px var(--accent-border)" : "none",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: RISK_VAR[p.r],
                  marginRight: 5,
                  verticalAlign: 1,
                }}
              />
              {p.p}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniSettings() {
  const rows: Array<[string, string]> = [
    ["KB editor", "33 entries · YAML"],
    ["Recycle bin", "3 deleted · empty in 30d"],
    ["Editor integration", "vscode://file/…"],
    ["Wordlists", "/usr/share/seclists"],
  ];
  return (
    <div style={{ padding: 12 }}>
      <div className="flex flex-col" style={{ gap: 6 }}>
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-center"
            style={{
              padding: "6px 8px",
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--bg-2)",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 500 }}>{k}</span>
            <span
              className="mono ml-auto"
              style={{ fontSize: 10, color: "var(--fg-subtle)" }}
            >
              {v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniPalette() {
  const items: Array<[string, string, boolean]> = [
    ["port", "Go to · 445/tcp · samba", true],
    ["cmd", "Run · smbclient -L //…", false],
    ["check", "Toggle · usermap_script", false],
  ];
  return (
    <div style={{ padding: 12 }}>
      <div
        className="flex items-center"
        style={{
          padding: "6px 8px",
          border: "1px solid var(--border)",
          borderRadius: 4,
          background: "var(--bg-1)",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            width: 11,
            height: 11,
            borderRadius: 999,
            border: "1px solid var(--fg-subtle)",
            display: "inline-block",
          }}
        />
        <span
          className="mono"
          style={{ fontSize: 11, color: "var(--fg-muted)" }}
        >
          port 445 smb
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 12,
              background: "var(--accent)",
              marginLeft: 2,
              verticalAlign: -2,
              animation: "rd-blink 1s steps(2) infinite",
            }}
          />
        </span>
      </div>
      <div className="flex flex-col" style={{ gap: 4 }}>
        {items.map(([k, t, hl]) => (
          <div
            key={t}
            className="flex items-center"
            style={{
              padding: "5px 8px",
              borderRadius: 4,
              background: hl ? "var(--bg-3)" : "transparent",
              border: hl
                ? "1px solid var(--border-strong)"
                : "1px solid transparent",
              gap: 8,
              fontSize: 11,
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 9.5,
                color: "var(--fg-subtle)",
                width: 32,
              }}
            >
              {k}
            </span>
            <span style={{ flex: 1 }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
