"use client";

/**
 * EngagementSettingsList — destructive-action surface for engagements.
 *
 * Renders the full engagement list with an inline "Open" link to the detail
 * page and a "Delete" button that prompts a confirm modal. Deletion goes
 * through `DELETE /api/engagements/[id]` which CASCADE-wipes every owned
 * row and its FTS5 index entries.
 *
 * Keeps state minimal — server is source of truth, we just `router.refresh()`
 * on success so the parent server component re-renders the list.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { EngagementSummary } from "@/lib/db";

interface Props {
  engagements: EngagementSummary[];
}

export function EngagementSettingsList({ engagements }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<number | null>(null);

  if (engagements.length === 0) return null;

  function handleDelete(id: number) {
    startTransition(async () => {
      const res = await fetch(`/api/engagements/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(body.error ?? "Delete failed.");
        setConfirmId(null);
        return;
      }
      toast.success("Engagement deleted.");
      setConfirmId(null);
      router.refresh();
    });
  }

  const target = engagements.find((e) => e.id === confirmId) ?? null;

  return (
    <>
      <ul
        style={{
          border: "1px solid var(--border)",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        {engagements.map((e, i) => (
          <li
            key={e.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
              background: "var(--bg-2)",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }} className="truncate">
                {e.name}
              </div>
              <div
                className="mono"
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  color: "var(--fg-muted)",
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span>{e.primary_ip}</span>
                <span>·</span>
                <span>{e.host_count}h</span>
                <span>·</span>
                <span>{e.port_count}p</span>
                <span>·</span>
                <span>{e.source}</span>
                <span>·</span>
                <span>{e.created_at.slice(0, 10)}</span>
              </div>
            </div>
            <Link
              href={`/engagements/${e.id}`}
              style={{
                fontSize: 12,
                padding: "5px 10px",
                borderRadius: 5,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--fg-muted)",
                textDecoration: "none",
              }}
            >
              Open
            </Link>
            <button
              type="button"
              onClick={() => setConfirmId(e.id)}
              disabled={pending}
              className="inline-flex items-center gap-1.5"
              style={{
                fontSize: 12,
                padding: "5px 10px",
                borderRadius: 5,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--risk-crit)",
                cursor: "pointer",
              }}
              title="Delete this engagement permanently"
            >
              <Trash2 size={12} />
              Delete
            </button>
          </li>
        ))}
      </ul>

      {target && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
          }}
          onClick={() => !pending && setConfirmId(null)}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            style={{
              width: 460,
              maxWidth: "90vw",
              padding: 20,
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          >
            <h2
              id="delete-confirm-title"
              style={{
                fontSize: 15,
                fontWeight: 600,
                margin: 0,
              }}
            >
              Delete <span className="mono">{target.name}</span>?
            </h2>
            <p
              style={{
                marginTop: 8,
                fontSize: 13,
                color: "var(--fg-muted)",
                lineHeight: 1.5,
              }}
            >
              This permanently removes every host ({target.host_count}), port
              ({target.port_count}), NSE script, finding, evidence
              attachment, note and check state owned by this engagement. The
              raw nmap input is also lost. <strong>Cannot be undone.</strong>
            </p>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                disabled={pending}
                style={{
                  fontSize: 12,
                  padding: "6px 12px",
                  borderRadius: 5,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--fg)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(target.id)}
                disabled={pending}
                style={{
                  fontSize: 12,
                  padding: "6px 12px",
                  borderRadius: 5,
                  border: "1px solid var(--risk-crit)",
                  background: "var(--risk-crit)",
                  color: "#0b0b0b",
                  fontWeight: 600,
                  cursor: pending ? "wait" : "pointer",
                }}
              >
                {pending ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
