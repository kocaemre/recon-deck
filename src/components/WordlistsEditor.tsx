"use client";

/**
 * WordlistsEditor — CRUD UI for `/settings/wordlists` (P1-E).
 *
 * Two-section layout:
 *   1. Add custom override row (free-form key + path, validated via API).
 *   2. Table — one row per shipped default key, augmented with its current
 *      override (if any) plus any operator-only keys appended after the
 *      shipped block.
 *
 * Inline edit mirrors CommandsEditor: click the path cell to swap to an
 * input, save with check, cancel with X. Delete reverts to the shipped
 * default (if the key is shipped) or removes the row entirely (custom).
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, X, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { WordlistOverride } from "@/lib/db/schema";

interface ShippedEntry {
  key: string;
  path: string;
}

interface Props {
  shipped: ShippedEntry[];
  initialOverrides: WordlistOverride[];
}

export function WordlistsEditor({ shipped, initialOverrides }: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const router = useRouter();

  // Index overrides by key for O(1) lookup while merging with shipped.
  const overrideByKey = useMemo(() => {
    const m = new Map<string, WordlistOverride>();
    for (const o of initialOverrides) m.set(o.key, o);
    return m;
  }, [initialOverrides]);

  // Build merged row list: every shipped key first (in shipped order), then
  // any operator-only override keys (sorted) appended below.
  const rows = useMemo(() => {
    const shippedKeys = new Set(shipped.map((s) => s.key));
    const customOverrides = initialOverrides
      .filter((o) => !shippedKeys.has(o.key))
      .sort((a, b) => a.key.localeCompare(b.key));
    return [
      ...shipped.map((s) => ({
        key: s.key,
        defaultPath: s.path,
        override: overrideByKey.get(s.key) ?? null,
        isShipped: true as const,
      })),
      ...customOverrides.map((o) => ({
        key: o.key,
        defaultPath: null,
        override: o,
        isShipped: false as const,
      })),
    ];
  }, [shipped, initialOverrides, overrideByKey]);

  async function upsert(key: string, path: string): Promise<boolean> {
    const res = await fetch("/api/wordlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, path }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Save failed.");
      return false;
    }
    toast.success(`${key} updated`);
    setEditingKey(null);
    router.refresh();
    return true;
  }

  async function remove(key: string) {
    const res = await fetch(`/api/wordlists/${key}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed.");
      return;
    }
    toast.success(`${key} reset`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <NewOverrideRow onCreate={(k, p) => upsert(k, p)} />

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "var(--bg-1)",
          overflow: "hidden",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12.5,
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-2)",
              }}
            >
              <Th style={{ width: 220 }}>Placeholder</Th>
              <Th>Resolved path</Th>
              <Th style={{ width: 90 }}>Source</Th>
              <Th style={{ width: 80, textAlign: "right" }}>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              editingKey === row.key ? (
                <EditRow
                  key={row.key}
                  rowKey={row.key}
                  initialPath={row.override?.path ?? row.defaultPath ?? ""}
                  onCancel={() => setEditingKey(null)}
                  onSave={(p) => upsert(row.key, p)}
                />
              ) : (
                <ViewRow
                  key={row.key}
                  rowKey={row.key}
                  resolvedPath={row.override?.path ?? row.defaultPath ?? ""}
                  isOverridden={row.override !== null}
                  isShipped={row.isShipped}
                  onEdit={() => setEditingKey(row.key)}
                  onReset={() => remove(row.key)}
                />
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewOverrideRow({
  onCreate,
}: {
  onCreate: (key: string, path: string) => Promise<boolean>;
}) {
  const [key, setKey] = useState("");
  const [path, setPath] = useState("");
  const trimmedKey = key.trim().toUpperCase();
  const trimmedPath = path.trim();
  const validShape = /^WORDLIST_[A-Z0-9_]+$/.test(trimmedKey);
  const disabled = !validShape || trimmedPath.length === 0;

  async function submit() {
    if (disabled) return;
    const ok = await onCreate(trimmedKey, trimmedPath);
    if (ok) {
      setKey("");
      setPath("");
    }
  }

  return (
    <div
      className="flex items-end gap-2"
      style={{
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 6,
        background: "var(--bg-1)",
      }}
    >
      <Field label="Key" style={{ width: 240 }}>
        <input
          className="mono"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="WORDLIST_MY_CUSTOM"
          style={{ ...cell, fontFamily: "var(--font-mono)" }}
        />
      </Field>
      <Field label="Path" style={{ flex: 1 }}>
        <input
          className="mono"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/usr/share/seclists/..."
          style={{ ...cell, fontFamily: "var(--font-mono)" }}
        />
      </Field>
      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        style={btnPrimary(disabled)}
        title={
          !validShape
            ? "Key must match WORDLIST_[A-Z0-9_]+"
            : "Add override"
        }
      >
        <Plus size={12} /> Add
      </button>
    </div>
  );
}

function ViewRow({
  rowKey,
  resolvedPath,
  isOverridden,
  isShipped,
  onEdit,
  onReset,
}: {
  rowKey: string;
  resolvedPath: string;
  isOverridden: boolean;
  isShipped: boolean;
  onEdit: () => void;
  onReset: () => void;
}) {
  const sourceLabel = isOverridden
    ? "Custom"
    : isShipped
      ? "Default"
      : "Custom";
  return (
    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <Td className="mono">{`{${rowKey}}`}</Td>
      <Td className="mono" style={{ wordBreak: "break-all" }}>
        {resolvedPath}
      </Td>
      <Td>
        <span
          style={{
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 3,
            background: isOverridden ? "var(--bg-2)" : "transparent",
            color: isOverridden ? "var(--accent)" : "var(--fg-subtle)",
            border: isOverridden
              ? "1px solid var(--accent)"
              : "1px solid var(--border)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {sourceLabel}
        </span>
      </Td>
      <Td style={{ textAlign: "right" }}>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit"
          style={iconBtn}
          title="Edit path"
        >
          <Pencil size={11} />
        </button>{" "}
        {isOverridden && (
          <button
            type="button"
            onClick={onReset}
            aria-label={isShipped ? "Reset to default" : "Delete override"}
            style={{ ...iconBtn, color: "var(--risk-crit)" }}
            title={isShipped ? "Reset to default" : "Delete override"}
          >
            {isShipped ? <RotateCcw size={11} /> : <Trash2 size={11} />}
          </button>
        )}
      </Td>
    </tr>
  );
}

function EditRow({
  rowKey,
  initialPath,
  onCancel,
  onSave,
}: {
  rowKey: string;
  initialPath: string;
  onCancel: () => void;
  onSave: (path: string) => Promise<boolean>;
}) {
  const [path, setPath] = useState(initialPath);
  const trimmed = path.trim();
  const disabled = trimmed.length === 0;

  return (
    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <Td className="mono">{`{${rowKey}}`}</Td>
      <Td>
        <input
          className="mono"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          style={{ ...cell, fontFamily: "var(--font-mono)" }}
          autoFocus
        />
      </Td>
      <Td>
        <span style={{ color: "var(--fg-subtle)", fontSize: 10 }}>—</span>
      </Td>
      <Td style={{ textAlign: "right" }}>
        <button
          type="button"
          aria-label="Save"
          onClick={() => {
            if (!disabled) onSave(trimmed);
          }}
          disabled={disabled}
          style={{ ...iconBtn, opacity: disabled ? 0.5 : 1 }}
        >
          <Check size={11} />
        </button>{" "}
        <button
          type="button"
          aria-label="Cancel"
          onClick={onCancel}
          style={iconBtn}
        >
          <X size={11} />
        </button>
      </Td>
    </tr>
  );
}

function Th({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "6px 10px",
        fontSize: 10.5,
        color: "var(--fg-subtle)",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <td
      className={className}
      style={{
        padding: "6px 10px",
        color: "var(--fg)",
        verticalAlign: "middle",
        ...style,
      }}
    >
      {children}
    </td>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <div
        className="uppercase tracking-[0.08em] font-medium"
        style={{ fontSize: 10, color: "var(--fg-subtle)", marginBottom: 3 }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

const cell: React.CSSProperties = {
  width: "100%",
  padding: "5px 8px",
  background: "var(--bg-0)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--fg)",
  fontSize: 12,
  outline: "none",
};

const iconBtn: React.CSSProperties = {
  width: 22,
  height: 22,
  display: "inline-grid",
  placeItems: "center",
  border: "1px solid var(--border)",
  borderRadius: 4,
  background: "var(--bg-2)",
  color: "var(--fg-muted)",
  cursor: "pointer",
};

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    height: 30,
    padding: "0 12px",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    borderRadius: 5,
    background: "var(--accent)",
    color: "#05170d",
    border: "1px solid var(--accent)",
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}
