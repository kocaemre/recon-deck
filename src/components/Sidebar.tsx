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
  Tag as TagIcon,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { toast } from "sonner";
import type { EngagementSummary } from "@/lib/db/types";
import { useUIStore } from "@/lib/store";
import { DeleteEngagementDialog } from "@/components/DeleteEngagementDialog";
import { CloneEngagementDialog } from "@/components/CloneEngagementDialog";

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
  // v1.2: view mode (active vs archived) and a multi-select tag filter.
  // Both flow through the same `filtered` memo below so tag chips and the
  // sekme toggle stack with the text-search query (AND across all).
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  // v1.2: bulk filter chips. Each entry is independent (AND logic across
  // all active chips, on top of viewMode + selectedTags + text query).
  //   zero-coverage  → done === 0  (untouched engagements)
  //   risk-high      → high_findings_count > 0  (high or critical sev)
  //   has-findings   → findings_count > 0
  const [bulkFilters, setBulkFilters] = useState<
    Set<"zero-coverage" | "risk-high" | "has-findings">
  >(new Set());
  const pathname = usePathname();
  const router = useRouter();
  const setGlobalSearchOpen = useUIStore((s) => s.setGlobalSearchOpen);

  // Global keyboard shortcuts that live on every page (sidebar mounts in
  // the root layout). The Kbd hints next to "New engagement" / "Filter
  // engagements" used to be cosmetic — these handlers wire them up.
  //
  //   n  → push("/") (the landing page IS the "new engagement" form)
  //   /  → focus the sidebar filter input
  //
  // Both early-return when the user is already typing in a form so a
  // textarea / input never gets hijacked by these one-key shortcuts.
  // The "/" handler also early-returns when the engagement page's
  // CommandPalette is open (cmdk owns slash inside its input). Cmd+K /
  // ?  / j/k/x/c remain in KeyboardShortcutHandler — those are
  // engagement-scoped.
  useEffect(() => {
    function isInForm(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable
      );
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (isInForm(ev.target)) return;

      if (ev.key === "n" || ev.key === "N") {
        ev.preventDefault();
        router.push("/");
        return;
      }
      if (ev.key === "/") {
        ev.preventDefault();
        document.getElementById("sidebar-filter")?.focus();
        return;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  // v1.2: pre-compute counts and the union of all tags before filtering so
  // the sekme toggle + tag chip strip render predictable totals (the chip
  // count never depends on what the operator has typed).
  const activeCount = useMemo(
    () => engagements.filter((e) => !e.is_archived).length,
    [engagements],
  );
  const archivedCount = useMemo(
    () => engagements.filter((e) => e.is_archived).length,
    [engagements],
  );
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const e of engagements) for (const t of e.tags) set.add(t);
    return Array.from(set).sort();
  }, [engagements]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return engagements.filter((e) => {
      // Sekme: archived view shows only archived rows; active view hides them.
      if (viewMode === "active" && e.is_archived) return false;
      if (viewMode === "archived" && !e.is_archived) return false;
      // Tag chip filter: AND across selected tags (every selected tag must
      // be present on the engagement).
      if (selectedTags.size > 0) {
        for (const t of selectedTags) if (!e.tags.includes(t)) return false;
      }
      // v1.2: bulk-filter chips. AND across all active chips so the
      // operator can stack "untouched + has-findings" to surface
      // partly-imported engagements they haven't started checking yet.
      if (bulkFilters.has("zero-coverage") && e.done > 0) return false;
      if (bulkFilters.has("risk-high") && e.high_findings_count === 0)
        return false;
      if (bulkFilters.has("has-findings") && e.findings_count === 0)
        return false;
      // Text query last (cheapest miss path stays first).
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.primary_ip.toLowerCase().includes(q) ||
        (e.primary_hostname?.toLowerCase().includes(q) ?? false) ||
        e.tags.some((t) => t.includes(q))
      );
    });
  }, [filter, engagements, viewMode, selectedTags, bulkFilters]);

  function toggleBulk(key: "zero-coverage" | "risk-high" | "has-findings") {
    setBulkFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleTagFilter(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

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
          <Chip variant="solid">v2.0</Chip>
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

      {/* v1.2: Active / Archived sekme toggle */}
      <div className="px-[10px] pt-2 pb-[4px] flex items-center gap-1">
        <SekmeButton
          active={viewMode === "active"}
          onClick={() => setViewMode("active")}
          label="Active"
          count={activeCount}
        />
        <SekmeButton
          active={viewMode === "archived"}
          onClick={() => setViewMode("archived")}
          label="Archived"
          count={archivedCount}
        />
      </div>

      {/* v2.1.1: bulk filter chips (Coverage 0% / Risk ≥ high / Has
          findings) removed — solo-tool's small N didn't justify the
          sidebar real estate. The filtering logic (bulkFilters Set) is
          kept inert in case a future "Filters ▾" disclosure brings them
          back behind a click. Tag chips below stay — they earn their
          space with low setup cost. */}

      {/* v1.2: Tag chip filter strip — only when at least one engagement carries a tag */}
      {allTags.length > 0 && (
        <div
          className="px-[10px] pt-1 pb-[6px] flex flex-wrap gap-1"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          {allTags.map((tag) => {
            const active = selectedTags.has(tag);
            const c = tagColors(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTagFilter(tag)}
                className="mono"
                style={{
                  padding: "1px 7px",
                  borderRadius: 3,
                  border: `1px solid ${active ? c.borderColor : "var(--border)"}`,
                  background: active ? c.bg : "var(--bg-2)",
                  color: active ? c.fg : "var(--fg-muted)",
                  fontSize: 10.5,
                  cursor: "pointer",
                  lineHeight: 1.5,
                }}
                title={active ? `Stop filtering by ${tag}` : `Filter by ${tag}`}
              >
                #{tag}
              </button>
            );
          })}
          {selectedTags.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTags(new Set())}
              style={{
                padding: "1px 6px",
                borderRadius: 3,
                background: "transparent",
                border: 0,
                color: "var(--fg-subtle)",
                fontSize: 10.5,
                cursor: "pointer",
              }}
              title="Clear tag filters"
            >
              clear
            </button>
          )}
        </div>
      )}

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
                    tags={e.tags}
                    isArchived={e.is_archived}
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

function SekmeButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="uppercase tracking-[0.08em] font-medium"
      style={{
        flex: 1,
        padding: "5px 8px",
        borderRadius: 4,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "var(--bg-3)" : "transparent",
        color: active ? "var(--accent)" : "var(--fg-subtle)",
        fontSize: 10.5,
        cursor: "pointer",
        textAlign: "center",
      }}
    >
      {label} <span className="mono" style={{ marginLeft: 4 }}>{count}</span>
    </button>
  );
}

function BulkChip({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        padding: "2px 8px",
        borderRadius: 3,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "var(--bg-3)" : "var(--bg-2)",
        color: active ? "var(--accent)" : "var(--fg-muted)",
        fontSize: 10.5,
        cursor: "pointer",
        lineHeight: 1.55,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

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
  tags,
  isArchived,
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
  tags: string[];
  isArchived: boolean;
}) {
  const when = formatRelative(createdAt);
  const complete = total > 0 && done === total;
  const pct = total === 0 ? 0 : (done / total) * 100;
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
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

  function onDuplicate() {
    setMenuOpen(false);
    setCloneOpen(true);
  }

  function onCloned(newId: number) {
    // Jump straight to the clone so the operator can dive in immediately;
    // refresh keeps the sidebar's RSC tree honest while we navigate.
    router.push(`/engagements/${newId}`);
    router.refresh();
  }

  async function onToggleArchive() {
    setMenuOpen(false);
    const next = !isArchived;
    try {
      const res = await fetch(`/api/engagements/${engagementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Archive failed.");
        return;
      }
      toast.success(next ? "Engagement archived" : "Engagement restored");
      router.refresh();
    } catch {
      toast.error("Archive failed.");
    }
  }

  async function onEditTags() {
    setMenuOpen(false);
    const next = window.prompt(
      "Tags (comma-separated, lowercase, max 32 chars each)",
      tags.join(", "),
    );
    if (next === null) return;
    const cleaned = next
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
    try {
      const res = await fetch(`/api/engagements/${engagementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: cleaned }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Tags update failed.");
        return;
      }
      toast.success("Tags updated");
      router.refresh();
    } catch {
      toast.error("Tags update failed.");
    }
  }

  function onDeleteClick() {
    setMenuOpen(false);
    setDeleteOpen(true);
  }

  function onDeleted() {
    // Active row gone — bounce to the dashboard so we're not stuck on a
    // stale URL. Otherwise just refresh in place to drop the row.
    // Both branches need router.refresh() so the sidebar's RSC tree
    // re-fetches and the deleted row disappears immediately;
    // router.push alone keeps the cached tree.
    if (active) {
      router.push("/");
    }
    router.refresh();
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
          {isArchived && (
            <Archive
              size={11}
              style={{ color: "var(--fg-faint)", flexShrink: 0 }}
              aria-label="archived"
            />
          )}
          <span
            className="truncate"
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              flex: 1,
              minWidth: 0,
              opacity: isArchived ? 0.7 : 1,
            }}
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
        {tags.length > 0 && (
          <div
            className="flex flex-wrap gap-1"
            style={{ marginTop: 4 }}
          >
            {tags.map((t) => {
              const c = tagColors(t);
              return (
                <span
                  key={t}
                  className="mono"
                  style={{
                    padding: "0 5px",
                    borderRadius: 3,
                    background: c.bg,
                    border: `1px solid ${c.borderColor}`,
                    fontSize: 9.5,
                    color: c.fg,
                    lineHeight: 1.55,
                  }}
                >
                  #{t}
                </span>
              );
            })}
          </div>
        )}
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
              <span
                style={{ color: "var(--accent)" }}
                title={`${hostCount} hosts in this engagement`}
              >
                {hostCount}h
              </span>
            </>
          )}
          <span>·</span>
          <span>{portCount}p</span>
          <span>·</span>
          <span>
            {done}/{total}
          </span>
          {/* v2.1.1: suppressHydrationWarning — formatRelative(createdAt)
              uses Date.now() so the server render and the client mount
              are bound to disagree by a few seconds (e.g. "2m" → "3m"
              in the React 19 hydration warning). The drift is harmless
              and the value reconciles on the very next render. */}
          <span
            style={{ marginLeft: "auto" }}
            suppressHydrationWarning
          >
            {when}
          </span>
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
          <MenuItem onClick={onEditTags} icon={<TagIcon size={11} />}>
            Edit tags…
          </MenuItem>
          <MenuItem onClick={onDuplicate} icon={<Copy size={11} />}>
            Duplicate
          </MenuItem>
          <MenuItem
            onClick={onToggleArchive}
            icon={
              isArchived ? <ArchiveRestore size={11} /> : <Archive size={11} />
            }
          >
            {isArchived ? "Restore from archive" : "Archive"}
          </MenuItem>
          <MenuItem
            onClick={onDeleteClick}
            icon={<Trash2 size={11} />}
            danger
          >
            Delete
          </MenuItem>
        </div>
      )}

      <DeleteEngagementDialog
        engagementId={engagementId}
        engagementName={name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={onDeleted}
      />

      <CloneEngagementDialog
        engagementId={engagementId}
        sourceName={name}
        open={cloneOpen}
        onOpenChange={setCloneOpen}
        onCloned={onCloned}
      />
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

/**
 * v1.4.1: deterministic tag → HSL color. Same FNV-1a-style hash that
 * the heatmap uses for risk colors so tag chips stay readable in dark
 * mode and the same tag always gets the same hue across renders.
 *
 * Returns:
 *   borderColor — saturated edge so the chip pops against the row bg
 *   bg          — low-alpha tint for the fill
 *   fg          — light text that meets ~AA on the tinted bg
 */
function tagColors(tag: string): {
  borderColor: string;
  bg: string;
  fg: string;
} {
  let h = 2166136261;
  for (let i = 0; i < tag.length; i++) {
    h ^= tag.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = Math.abs(h) % 360;
  return {
    borderColor: `hsl(${hue}, 55%, 45%)`,
    bg: `hsl(${hue}, 40%, 18%)`,
    fg: `hsl(${hue}, 70%, 78%)`,
  };
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
