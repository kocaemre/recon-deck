"use client";

/**
 * Sidebar — Modern IDE redesign (client component).
 *
 * Handles a local "filter engagements" state (the reason this is client).
 * Structure (top → bottom):
 *   1. Brand row — accent "rd" square, app name, version chip.
 *   2. New engagement button — full-width, Plus icon, N kbd.
 *   3. Filter input — search icon, `/` kbd.
 *   4. Engagements count label.
 *   5. Scrollable engagement list — active-row highlight, per-row meta.
 *   6. Footer status bar — offline/local DB indicator.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Search, Check as CheckIcon, Globe, Cog } from "lucide-react";
import type { EngagementSummary } from "@/lib/db/types";
import { useUIStore } from "@/lib/store";

export type SidebarEngagement = EngagementSummary & {
  total: number;
  done: number;
};

interface SidebarProps {
  engagements: SidebarEngagement[];
}

export function Sidebar({ engagements }: SidebarProps) {
  const [filter, setFilter] = useState("");
  const pathname = usePathname();
  const setGlobalSearchOpen = useUIStore((s) => s.setGlobalSearchOpen);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return engagements;
    return engagements.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.primary_ip.toLowerCase().includes(q) ||
        (e.primary_hostname?.toLowerCase().includes(q) ?? false),
    );
  }, [filter, engagements]);

  return (
    <aside
      className="flex h-screen shrink-0 flex-col"
      style={{
        width: 260,
        background: "var(--bg-1)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Brand row */}
      <div className="px-[14px] pt-[14px] pb-[10px]">
        <div className="mb-[10px] flex items-center gap-2">
          <div
            className="mono grid place-items-center"
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              background: "var(--accent)",
              color: "#05170d",
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            rd
          </div>
          <span
            className="font-semibold"
            style={{ letterSpacing: "-0.01em", fontSize: 13 }}
          >
            recon-deck
          </span>
          <Chip variant="solid">v1.0</Chip>
        </div>

        <Link
          href="/"
          className="flex items-center justify-center gap-1.5"
          style={{
            width: "100%",
            height: 28,
            padding: "0 10px",
            borderRadius: 5,
            border: "1px solid var(--border)",
            background: "var(--bg-2)",
            color: "var(--fg)",
            fontSize: 12,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          <Plus size={12} /> New engagement
          <span style={{ marginLeft: "auto" }}>
            <Kbd>N</Kbd>
          </span>
        </Link>
      </div>

      {/* Filter input + global search trigger */}
      <div className="px-[10px] pb-[6px] flex flex-col gap-1.5">
        <div
          className="flex items-center gap-1.5"
          style={{
            padding: "6px 8px",
            border: "1px solid var(--border)",
            borderRadius: 5,
            background: "var(--bg-0)",
          }}
        >
          <Search size={12} style={{ color: "var(--fg-subtle)" }} />
          <input
            id="sidebar-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter engagements"
            style={{
              flex: 1,
              background: "transparent",
              border: 0,
              outline: "none",
              color: "var(--fg)",
              fontSize: 12,
            }}
          />
          <Kbd>/</Kbd>
        </div>
        <button
          type="button"
          onClick={() => setGlobalSearchOpen(true)}
          className="flex items-center gap-1.5"
          style={{
            padding: "6px 8px",
            border: "1px solid var(--border)",
            borderRadius: 5,
            background: "transparent",
            color: "var(--fg-subtle)",
            fontSize: 11.5,
            cursor: "pointer",
            textAlign: "left",
          }}
          title="Search across all engagements (Ctrl/Cmd+Shift+F)"
        >
          <Globe size={11} />
          <span style={{ flex: 1 }}>Search all engagements</span>
          <Kbd>⇧⌘F</Kbd>
        </button>
      </div>

      {/* Count label */}
      <div className="px-[10px] pt-2 pb-[6px]">
        <div
          className="uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
        >
          Engagements · {engagements.length}
        </div>
      </div>

      {/* Engagement list */}
      <nav className="flex-1 overflow-y-auto px-[6px] pb-[10px]">
        {engagements.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p
              className="font-semibold"
              style={{ fontSize: 13, color: "var(--fg)" }}
            >
              No engagements yet
            </p>
            <p
              className="mt-1"
              style={{ fontSize: 11.5, color: "var(--fg-muted)" }}
            >
              Paste nmap output to create your first engagement.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p
            className="px-3 py-4 text-center"
            style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}
          >
            No matches.
          </p>
        ) : (
          <ul>
            {filtered.map((e) => {
              const href = `/engagements/${e.id}`;
              const active = pathname === href;
              return (
                <li key={e.id}>
                  <SidebarRow
                    href={href}
                    active={active}
                    name={e.name}
                    ip={e.primary_ip}
                    portCount={e.port_count}
                    hostCount={e.host_count}
                    createdAt={e.created_at}
                    done={e.done}
                    total={e.total}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Footer status bar */}
      <div
        className="flex items-center gap-2.5"
        style={{
          borderTop: "1px solid var(--border)",
          padding: "10px 14px",
          fontSize: 11,
          color: "var(--fg-subtle)",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: "var(--accent)",
          }}
        />
        <span>offline · local db</span>
        <Link
          href="/settings"
          style={{
            marginLeft: "auto",
            color: "var(--fg-muted)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 6px",
            borderRadius: 4,
            border: "1px solid transparent",
          }}
          title="Open settings"
        >
          <Cog size={11} />
          Settings
        </Link>
      </div>
    </aside>
  );
}

/* ---------------- sub components ---------------- */

function SidebarRow({
  href,
  active,
  name,
  ip,
  portCount,
  hostCount,
  createdAt,
  done,
  total,
}: {
  href: string;
  active: boolean;
  name: string;
  ip: string;
  portCount: number;
  hostCount: number;
  createdAt: string;
  done: number;
  total: number;
}) {
  const when = formatRelative(createdAt);
  const complete = total > 0 && done === total;
  const pct = total === 0 ? 0 : (done / total) * 100;
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: "8px 10px",
        borderRadius: 5,
        background: active ? "var(--bg-3)" : "transparent",
        border: active
          ? "1px solid var(--border-strong)"
          : "1px solid transparent",
        marginBottom: 2,
        textDecoration: "none",
        color: "var(--fg)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="truncate"
          style={{ fontSize: 12.5, fontWeight: 500, flex: 1, minWidth: 0 }}
        >
          {name}
        </span>
        {complete && (
          <CheckIcon
            size={11}
            strokeWidth={3}
            style={{ color: "var(--accent)" }}
            aria-label="complete"
          />
        )}
      </div>
      <div
        className="mono flex items-center gap-1.5"
        style={{ marginTop: 3, fontSize: 11, color: "var(--fg-subtle)" }}
      >
        <span className="truncate" style={{ minWidth: 0 }}>
          {ip}
        </span>
        {/* P1-F PR 4: multi-host engagements show "Nh" host count chip
            (kept compact to fit the existing meta row width). Single-host
            engagements omit the chip — visual layout unchanged. */}
        {hostCount > 1 && (
          <>
            <span>·</span>
            <span style={{ color: "var(--accent)" }}>{hostCount}h</span>
          </>
        )}
        <span>·</span>
        <span>{portCount}p</span>
        <span>·</span>
        <span>
          {done}/{total}
        </span>
        <span style={{ marginLeft: "auto" }}>{when}</span>
      </div>
      <div style={{ marginTop: 6 }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 2,
            background: "var(--bg-3)",
            borderRadius: 2,
            overflow: "hidden",
          }}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${pct}%`,
              background: complete ? "var(--accent)" : "var(--accent-dim)",
            }}
          />
        </div>
      </div>
    </Link>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mono inline-flex items-center justify-center"
      style={{
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: 3,
        background: "var(--bg-3)",
        border: "1px solid var(--border)",
        borderBottomWidth: 2,
        fontSize: 10,
        color: "var(--fg-muted)",
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

function Chip({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "solid";
}) {
  return (
    <span
      className="mono inline-flex items-center gap-1"
      style={{
        padding: "2px 7px",
        borderRadius: 3,
        background: variant === "solid" ? "var(--bg-1)" : "var(--bg-3)",
        border: "1px solid var(--border)",
        fontSize: 11,
        color: "var(--fg-muted)",
        lineHeight: 1.4,
      }}
    >
      {children}
    </span>
  );
}

function formatRelative(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - then);
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}
