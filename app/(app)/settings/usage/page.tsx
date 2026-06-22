/**
 * Settings → Usage page (v2.5.0 beta-test feature).
 *
 * Read-only analytics over the `ai_usage` ledger: total spend / tokens / calls,
 * then breakdowns by model, by target (engagement or host), and by task, plus a
 * recent-calls table. Dependency-free CSS bars keep the offline/auditable ethos
 * — no charting library. Everything is local SQLite; nothing leaves the host.
 */

import Link from "next/link";
import { db, buildUsageReport, type UsageGroup, type UsageTotals } from "@/lib/db";

export const dynamic = "force-dynamic";

const fmtUsd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const fmtNum = (n: number) => n.toLocaleString("en-US");

export default function UsageSettingsPage() {
  const report = buildUsageReport(db);
  const { totals } = report;

  return (
    <div className="px-8 py-8" style={{ maxWidth: 980, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <div
          className="mono uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
        >
          SETTINGS · AI USAGE
        </div>
        <h1
          className="font-semibold"
          style={{ fontSize: 24, letterSpacing: "-0.02em", margin: "4px 0 8px" }}
        >
          AI usage &amp; cost
        </h1>
        <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.6 }}>
          Per-call token + cost ledger for the AI co-pilot. Cost is reported by
          OpenRouter; OpenAI / Ollama show tokens only. All local — nothing
          leaves your machine.
        </p>
      </header>

      {totals.calls === 0 ? (
        <EmptyState />
      ) : (
        <>
          <TotalsRow totals={totals} />
          <Section title="Spend by model">
            <BarList rows={report.byModel} totals={totals} />
          </Section>
          <Section title="By target (engagement / host)">
            <BarList rows={report.byTarget} totals={totals} />
          </Section>
          <Section title="By task">
            <BarList rows={report.byTask} totals={totals} />
          </Section>
          <Section title="Recent calls">
            <RecentTable rows={report.recent} hasCost={totals.hasCost} />
          </Section>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: 32,
        borderRadius: 8,
        border: "1px dashed var(--border)",
        background: "var(--bg-1)",
        textAlign: "center",
        color: "var(--fg-muted)",
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      No AI usage recorded yet. Enable the assistant in{" "}
      <Link href="/settings" className="mono" style={{ color: "var(--accent)" }}>
        Settings → AI
      </Link>{" "}
      and run an <strong>Explain</strong> or <strong>Suggest commands</strong> on
      a port — calls are logged here with their token counts and cost.
    </div>
  );
}

function TotalsRow({ totals }: { totals: UsageTotals }) {
  const cards = [
    { label: "Calls", value: fmtNum(totals.calls) },
    {
      label: "Cost",
      value: totals.hasCost ? fmtUsd(totals.costUsd) : "—",
      sub: totals.hasCost ? undefined : "provider reports no cost",
    },
    { label: "Input tokens", value: fmtNum(totals.promptTokens) },
    { label: "Output tokens", value: fmtNum(totals.completionTokens) },
  ];
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12,
        marginBottom: 28,
      }}
    >
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            padding: "14px 16px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg-1)",
          }}
        >
          <div
            className="mono uppercase tracking-[0.06em]"
            style={{ fontSize: 9.5, color: "var(--fg-subtle)" }}
          >
            {c.label}
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>
            {c.value}
          </div>
          {c.sub && (
            <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 2 }}>
              {c.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2
        className="uppercase tracking-[0.06em] font-medium"
        style={{ fontSize: 11, color: "var(--fg-subtle)", marginBottom: 10 }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function BarList({ rows, totals }: { rows: UsageGroup[]; totals: UsageTotals }) {
  // Bars are proportional to cost when we have any, else to total tokens.
  const useCost = totals.hasCost;
  const metric = (g: UsageGroup) =>
    useCost ? g.costUsd : g.promptTokens + g.completionTokens;
  const max = Math.max(...rows.map(metric), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((g) => {
        const m = metric(g);
        const pct = Math.max(2, (m / max) * 100);
        return (
          <div key={g.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              className="mono"
              style={{
                width: 230,
                flexShrink: 0,
                fontSize: 11.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={g.key}
            >
              {g.key}
            </div>
            <div
              style={{
                flex: 1,
                height: 18,
                background: "var(--bg-2)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: "var(--accent)",
                  opacity: 0.5,
                }}
              />
            </div>
            <div
              className="mono"
              style={{
                width: 150,
                flexShrink: 0,
                textAlign: "right",
                fontSize: 11,
                color: "var(--fg-muted)",
              }}
            >
              {useCost ? fmtUsd(g.costUsd) : fmtNum(m)} · {g.calls}×
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecentTable({
  rows,
  hasCost,
}: {
  rows: import("@/lib/db/schema").AiUsage[];
  hasCost: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
        <thead>
          <tr style={{ background: "var(--bg-2)", textAlign: "left" }}>
            {["When", "Target", "Task", "Model", "In/Out", hasCost ? "Cost" : ""].map(
              (h) => (
                <th
                  key={h}
                  className="mono uppercase tracking-[0.05em]"
                  style={{ padding: "7px 10px", fontSize: 9.5, color: "var(--fg-subtle)" }}
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td className="mono" style={{ padding: "6px 10px", color: "var(--fg-muted)" }}>
                {r.created_at.slice(0, 16).replace("T", " ")}
              </td>
              <td style={{ padding: "6px 10px" }}>
                {r.engagement_label || r.host || "—"}
              </td>
              <td className="mono" style={{ padding: "6px 10px" }}>{r.task}</td>
              <td className="mono" style={{ padding: "6px 10px", color: "var(--fg-muted)" }}>
                {r.model}
              </td>
              <td className="mono" style={{ padding: "6px 10px" }}>
                {r.prompt_tokens}/{r.completion_tokens}
              </td>
              {hasCost && (
                <td className="mono" style={{ padding: "6px 10px" }}>
                  {r.cost_usd != null ? fmtUsd(r.cost_usd) : "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
