"use client";

/**
 * RecycleBinList — /settings tab for soft-deleted engagements (v1.3.0 #6).
 *
 * Mirrors EngagementSettingsList layout but swaps the row actions for
 * **Restore** (POST /api/engagements/:id/restore) and **Delete forever**
 * (DELETE /api/engagements/:id?force=true). The hard-delete affordance
 * lives only here so a stray click in the sidebar never triggers an
 * unrecoverable cascade.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { EngagementSummary } from "@/lib/db";

interface Props {
  engagements: EngagementSummary[];
}

export function RecycleBinList({ engagements }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [purgeId, setPurgeId] = useState<number | null>(null);

  if (engagements.length === 0) return null;

  function handleRestore(id: number) {
    startTransition(async () => {
      const res = await fetch(`/api/engagements/${id}/restore`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(body.error ?? "Restore failed.");
        return;
      }
      toast.success("Engagement restored.");
      router.refresh();
    });
  }

  function handlePurge(id: number) {
    startTransition(async () => {
      const res = await fetch(`/api/engagements/${id}?force=true`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(body.error ?? "Purge failed.");
        setPurgeId(null);
        return;
      }
      toast.success("Engagement purged.");
      setPurgeId(null);
      router.refresh();
    });
  }

  const target = engagements.find((e) => e.id === purgeId) ?? null;

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
              opacity: 0.85,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{ fontSize: 13, fontWeight: 500 }}
                className="truncate"
              >
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
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRestore(e.id)}
              disabled={pending}
              className="inline-flex items-center gap-1.5"
              style={{
                fontSize: 12,
                padding: "5px 10px",
                borderRadius: 5,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--accent)",
                cursor: pending ? "wait" : "pointer",
              }}
              title="Restore this engagement"
            >
              <ArchiveRestore size={12} />
              Restore
            </button>
            <button
              type="button"
              onClick={() => setPurgeId(e.id)}
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
              title="Permanently delete (no recovery)"
            >
              <Trash2 size={12} />
              Delete forever
            </button>
          </li>
        ))}
      </ul>

      {target && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="purge-confirm-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
          }}
          onClick={() => !pending && setPurgeId(null)}
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
              id="purge-confirm-title"
              style={{ fontSize: 15, fontWeight: 600, margin: 0 }}
            >
              Permanently delete{" "}
              <span className="mono">{target.name}</span>?
            </h2>
            <p
              style={{
                marginTop: 8,
                fontSize: 13,
                color: "var(--fg-muted)",
                lineHeight: 1.5,
              }}
            >
              Cascades through every host ({target.host_count}), port (
              {target.port_count}), NSE script, finding, evidence
              attachment, note and check state owned by this engagement. The
              raw input and the FTS5 index entries are also dropped.{" "}
              <strong>Cannot be undone.</strong>
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
                onClick={() => setPurgeId(null)}
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
                onClick={() => handlePurge(target.id)}
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
                {pending ? "Purging…" : "Delete forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
