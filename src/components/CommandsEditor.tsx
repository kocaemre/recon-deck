"use client";

/**
 * CommandsEditor — CRUD UI for `/settings/commands`.
 *
 * Inline-add row + table of existing snippets with edit/delete. Filter by
 * service/port empty = global; explicit values restrict scope.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, X, Check } from "lucide-react";
import { toast } from "sonner";
import type { UserCommand } from "@/lib/db/schema";

interface Props {
  initialCommands: UserCommand[];
}

export function CommandsEditor({ initialCommands }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const router = useRouter();

  async function onCreate(input: {
    service: string | null;
    port: number | null;
    label: string;
    template: string;
  }) {
    const res = await fetch("/api/user-commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Add failed.");
      return;
    }
    toast.success("Command added");
    router.refresh();
  }

  async function onUpdate(
    id: number,
    input: {
      service: string | null;
      port: number | null;
      label: string;
      template: string;
    },
  ) {
    const res = await fetch(`/api/user-commands/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Save failed.");
      return;
    }
    toast.success("Command updated");
    setEditingId(null);
    router.refresh();
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this command?")) return;
    const res = await fetch(`/api/user-commands/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed.");
      return;
    }
    toast.success("Deleted");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <NewCommandRow onCreate={onCreate} />

      {initialCommands.length === 0 ? (
        <div
          style={{
            padding: 16,
            textAlign: "center",
            border: "1px dashed var(--border-strong)",
            borderRadius: 6,
            background: "var(--bg-1)",
            color: "var(--fg-subtle)",
            fontSize: 12,
          }}
        >
          No personal commands yet. Use the row above to add your first one.
        </div>
      ) : (
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
                <Th style={{ width: 80 }}>Service</Th>
                <Th style={{ width: 70 }}>Port</Th>
                <Th style={{ width: 180 }}>Label</Th>
                <Th>Template</Th>
                <Th style={{ width: 70, textAlign: "right" }}>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {initialCommands.map((c) =>
                editingId === c.id ? (
                  <EditCommandRow
                    key={c.id}
                    cmd={c}
                    onCancel={() => setEditingId(null)}
                    onSave={(input) => onUpdate(c.id, input)}
                  />
                ) : (
                  <ViewCommandRow
                    key={c.id}
                    cmd={c}
                    onEdit={() => setEditingId(c.id)}
                    onDelete={() => onDelete(c.id)}
                  />
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewCommandRow({
  onCreate,
}: {
  onCreate: (input: {
    service: string | null;
    port: number | null;
    label: string;
    template: string;
  }) => Promise<void>;
}) {
  const [service, setService] = useState("");
  const [port, setPort] = useState("");
  const [label, setLabel] = useState("");
  const [template, setTemplate] = useState("");
  const disabled = !label.trim() || !template.trim();

  async function submit() {
    if (disabled) return;
    await onCreate({
      service: service.trim() || null,
      port: port ? parseInt(port, 10) : null,
      label: label.trim(),
      template: template.trim(),
    });
    setService("");
    setPort("");
    setLabel("");
    setTemplate("");
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
      <Field label="Service" style={{ width: 100 }}>
        <input
          value={service}
          onChange={(e) => setService(e.target.value)}
          placeholder="any"
          style={cell}
        />
      </Field>
      <Field label="Port" style={{ width: 80 }}>
        <input
          type="number"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          placeholder="any"
          style={cell}
          min={1}
          max={65535}
        />
      </Field>
      <Field label="Label" style={{ width: 180 }}>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. my hydra"
          style={cell}
        />
      </Field>
      <Field label="Template" style={{ flex: 1 }}>
        <input
          className="mono"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder="hydra -L users.txt -P passwords.txt {HOST}:{PORT}"
          style={{ ...cell, fontFamily: "var(--font-mono)" }}
        />
      </Field>
      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        style={btnPrimary(disabled)}
        title="Add command"
      >
        <Plus size={12} /> Add
      </button>
    </div>
  );
}

function ViewCommandRow({
  cmd,
  onEdit,
  onDelete,
}: {
  cmd: UserCommand;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <Td>{cmd.service ?? <Faint>any</Faint>}</Td>
      <Td className="mono">{cmd.port ?? <Faint>any</Faint>}</Td>
      <Td>{cmd.label}</Td>
      <Td className="mono" style={{ wordBreak: "break-all" }}>
        {cmd.template}
      </Td>
      <Td style={{ textAlign: "right" }}>
        <button type="button" onClick={onEdit} aria-label="Edit" style={iconBtn}>
          <Pencil size={11} />
        </button>{" "}
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete"
          style={{ ...iconBtn, color: "var(--risk-crit)" }}
        >
          <Trash2 size={11} />
        </button>
      </Td>
    </tr>
  );
}

function EditCommandRow({
  cmd,
  onCancel,
  onSave,
}: {
  cmd: UserCommand;
  onCancel: () => void;
  onSave: (input: {
    service: string | null;
    port: number | null;
    label: string;
    template: string;
  }) => Promise<void>;
}) {
  const [service, setService] = useState(cmd.service ?? "");
  const [port, setPort] = useState(cmd.port?.toString() ?? "");
  const [label, setLabel] = useState(cmd.label);
  const [template, setTemplate] = useState(cmd.template);

  return (
    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <Td>
        <input
          value={service}
          onChange={(e) => setService(e.target.value)}
          style={cell}
        />
      </Td>
      <Td>
        <input
          type="number"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          style={cell}
        />
      </Td>
      <Td>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={cell}
        />
      </Td>
      <Td>
        <input
          className="mono"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          style={{ ...cell, fontFamily: "var(--font-mono)" }}
        />
      </Td>
      <Td style={{ textAlign: "right" }}>
        <button
          type="button"
          aria-label="Save"
          onClick={() =>
            onSave({
              service: service.trim() || null,
              port: port ? parseInt(port, 10) : null,
              label: label.trim(),
              template: template.trim(),
            })
          }
          style={iconBtn}
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

function Faint({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ color: "var(--fg-faint)", fontStyle: "italic" }}>
      {children}
    </span>
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
