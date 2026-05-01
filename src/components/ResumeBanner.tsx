/**
 * ResumeBanner — landing-page "where you left off" banner (v1.4.0 #15).
 *
 * Server component. Reads a `ResumeCandidate` from the parent (computed
 * via `getResumeCandidate(db)`) and renders a one-row deep link to the
 * engagement (and active port if known). Hidden when the most recent
 * visit is older than 7 days — handled inside `getResumeCandidate`.
 */

import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import type { ResumeCandidate } from "@/lib/db";

interface Props {
  candidate: ResumeCandidate;
}

function relative(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - then);
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

export function ResumeBanner({ candidate }: Props) {
  const hasPort = candidate.last_visited_port_id != null && candidate.port_label;
  const href = hasPort
    ? `/engagements/${candidate.id}?port=${candidate.last_visited_port_id}`
    : `/engagements/${candidate.id}`;
  const target = hasPort
    ? `${candidate.host_label ?? candidate.primary_ip}:${candidate.port_label}`
    : candidate.primary_ip;

  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 18,
        padding: "10px 14px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--bg-2)",
        color: "var(--fg)",
        textDecoration: "none",
      }}
    >
      <Clock size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="mono uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10, color: "var(--fg-subtle)" }}
        >
          RESUME
        </div>
        <div
          className="truncate"
          style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}
        >
          {candidate.name}
          {hasPort && (
            <span
              className="mono"
              style={{
                marginLeft: 8,
                color: "var(--fg-muted)",
                fontSize: 11.5,
              }}
            >
              → {target}
            </span>
          )}
        </div>
      </div>
      <span
        className="mono"
        style={{ fontSize: 11, color: "var(--fg-faint)" }}
      >
        {relative(candidate.last_visited_at)}
      </span>
      <ArrowRight size={12} style={{ color: "var(--fg-muted)" }} />
    </Link>
  );
}
