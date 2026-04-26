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

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Check as CheckIcon,
  Globe,
  Cog,
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import type { EngagementSummary } from "@/lib/db/types";
import { useUIStore } from "@/lib/store";

export type SidebarEngagement = EngagementSummary & {
  total: number;
  done: number;
};

interface SidebarProps {
  engagements: SidebarEngagement[];
  /**
   * Latest applied Drizzle migration label (e.g. `0009`). Surfaced in the
   * footer so operators backing up / restoring know which schema version
   * their DB pins to. See README "Backup & Restore" for the compatibility
   * matrix.
   */
  schemaVersion?: string;
}

export function Sidebar({ engagements, schemaVersion }: SidebarProps) {
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
                    engagementId={e.id}
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
        {schemaVersion && (
          <span
            className="mono"
            title={`Drizzle migration ${schemaVersion} applied — see README › Backup & Restore`}
            style={{
              padding: "1px 5px",
              borderRadius: 3,
              border: "1px solid var(--border)",
              background: "var(--bg-2)",
              fontSize: 10,
              color: "var(--fg-faint)",
              lineHeight: 1.4,
            }}
          >
            schema {schemaVersion}
          </span>
        )}
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
  engagementId,
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
  engagementId: number;
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
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click and on Escape. Re-attached only
  // when the menu is open so we don't churn handlers on every row.
  useEffect(() => {
    if (!menuOpen) return;
    function handlePointer(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) setMenuOpen(false);
    }
    function handleKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  async function onRename() {
    setMenuOpen(false);
    const next = window.prompt("Rename engagement", name);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed.length === 0) {
      toast.error("Name cannot be empty.");
      return;
    }
    if (trimmed === name) return;
    try {
      const res = await fetch(`/api/engagements/${engagementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Rename failed.");
        return;
      }
      toast.success("Engagement renamed");
      router.refresh();
    } catch {
      toast.error("Rename failed.");
    }
  }

  async function onDuplicate() {
    setMenuOpen(false);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/clone`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Duplicate failed.");
        return;
      }
      const body = await res.json().catch(() => ({}));
      toast.success("Engagement duplicated");
      // Jump straight to the clone so the operator can rename / edit
      // immediately instead of hunting it down in the sidebar.
      if (typeof body.id === "number") {
        router.push(`/engagements/${body.id}`);
      } else {
        router.refresh();
      }
    } catch {
      toast.error("Duplicate failed.");
    }
  }

  async function onDelete() {
    setMenuOpen(false);
    if (
      !window.confirm(
        `Delete "${name}"? This wipes all ports, scripts, notes, evidence, and findings — cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/engagements/${engagementId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Delete failed.");
        return;
      }
      toast.success("Engagement deleted");
      // Active row gone — bounce to the dashboard so we're not stuck on a
      // stale URL. Otherwise just refresh in place to drop the row.
      if (active) {
        router.push("/");
      } else {
        router.refresh();
      }
    } catch {
      toast.error("Delete failed.");
    }
  }

  return (
    <div
      ref={rootRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: "relative" }}
    >
      <Link
        href={href}
        style={{
          display: "block",
          padding: "8px 10px",
          paddingRight: 30, // Reserve room for the kebab so long names don't slide under it.
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

      {/* Hover-kebab — visible on hover or while the menu is pinned open.
          The active row also keeps it visible so a single-mouseless
          operator can still tab to the trigger. */}
      {(hover || menuOpen || active) && (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Engagement actions"
          onClick={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 22,
            height: 22,
            display: "grid",
            placeItems: "center",
            border: "1px solid var(--border)",
            borderRadius: 4,
            background: menuOpen ? "var(--bg-3)" : "var(--bg-2)",
            color: "var(--fg-muted)",
            cursor: "pointer",
            zIndex: 1,
          }}
        >
          <MoreHorizontal size={12} />
        </button>
      )}

      {menuOpen && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: 30,
            right: 6,
            minWidth: 140,
            background: "var(--bg-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: 6,
            boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
            padding: 4,
            zIndex: 10,
          }}
        >
          <MenuItem onClick={onRename} icon={<Pencil size={11} />}>
            Rename
          </MenuItem>
          <MenuItem onClick={onDuplicate} icon={<Copy size={11} />}>
            Duplicate
          </MenuItem>
          <MenuItem
            onClick={onDelete}
            icon={<Trash2 size={11} />}
            danger
          >
            Delete
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  icon,
  danger,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "6px 10px",
        background: "transparent",
        border: 0,
        borderRadius: 4,
        color: danger ? "var(--risk-crit)" : "var(--fg)",
        fontSize: 12,
        cursor: "pointer",
        textAlign: "left",
      }}
      onMouseEnter={(ev) =>
        (ev.currentTarget.style.background = "var(--bg-3)")
      }
      onMouseLeave={(ev) =>
        (ev.currentTarget.style.background = "transparent")
      }
    >
      <span
        style={{
          display: "inline-flex",
          width: 14,
          color: danger ? "var(--risk-crit)" : "var(--fg-muted)",
        }}
      >
        {icon}
      </span>
      {children}
    </button>
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
