/**
 * Settings → index page.
 *
 * One stop for engagement management (delete) plus jump-off links to the
 * existing wordlist / custom command sub-pages.
 *
 * Engagement renames stay where they were (inline edit on the engagement
 * header). The settings page is the *destructive* surface: it's the only
 * place a pentester can wipe an engagement, so the destructive action
 * lives behind a confirm modal owned by `EngagementSettingsList`.
 */

import Link from "next/link";
import { db, listSummaries, listDeletedSummaries } from "@/lib/db";
import { EngagementSettingsList } from "@/components/EngagementSettingsList";
import { RecycleBinList } from "@/components/RecycleBinList";
import { EditorIntegrationToggle } from "@/components/EditorIntegrationToggle";

export const dynamic = "force-dynamic";

export default function SettingsIndexPage() {
  const engagements = listSummaries(db);
  const deleted = listDeletedSummaries(db);
  const totalHosts = engagements.reduce((acc, e) => acc + e.host_count, 0);
  const totalPorts = engagements.reduce((acc, e) => acc + e.port_count, 0);

  return (
    <div className="px-8 py-8" style={{ maxWidth: 900, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <div
          className="mono uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
        >
          SETTINGS
        </div>
        <h1
          className="font-semibold"
          style={{
            fontSize: 24,
            letterSpacing: "-0.02em",
            margin: "4px 0 8px",
          }}
        >
          Settings
        </h1>
        <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>
          Manage engagements and personal command / wordlist libraries. All
          state stays inside the local SQLite database — nothing leaves your
          machine.
        </p>
      </header>

      {/* Quick links to existing sub-pages. */}
      <section style={{ marginBottom: 32 }}>
        <SectionLabel>Libraries</SectionLabel>
        <div className="grid grid-cols-2 gap-3" style={{ marginTop: 8 }}>
          <SettingsLink
            href="/settings/wordlists"
            title="Wordlists"
            description="Override SecLists / dirb paths used by KB commands."
          />
          <SettingsLink
            href="/settings/commands"
            title="Custom commands"
            description="Personal command snippets surfaced alongside KB commands."
          />
          <SettingsLink
            href="/settings/kb"
            title="KB editor"
            description="Validate and save user knowledge-base entries against the schema. Hot-reloads."
          />
        </div>
      </section>

      {/* Engagement management — delete (destructive) lives here. */}
      <section style={{ marginBottom: 32 }}>
        <SectionLabel>Engagements</SectionLabel>
        <p
          style={{
            fontSize: 12,
            color: "var(--fg-muted)",
            margin: "6px 0 12px",
          }}
        >
          {engagements.length === 0
            ? "No engagements yet — paste an nmap scan from the landing page to get started."
            : `${engagements.length} engagement${engagements.length === 1 ? "" : "s"} · ${totalHosts} host${totalHosts === 1 ? "" : "s"} · ${totalPorts} port${totalPorts === 1 ? "" : "s"} total. Use the inline edit on the engagement header to rename.`}
        </p>
        <EngagementSettingsList engagements={engagements} />
      </section>

      {/* v1.4.0 #12: Editor integration toggle. */}
      <section style={{ marginBottom: 32 }}>
        <SectionLabel>Editor integration</SectionLabel>
        <p
          style={{
            fontSize: 12,
            color: "var(--fg-muted)",
            margin: "6px 0 12px",
          }}
        >
          Optional `vscode://file/…` jump link on the engagement header.
          Off by default — opt in here per browser.
        </p>
        <EditorIntegrationToggle />
      </section>

      {/* v1.3.0 #6: recycle bin. Only renders the section header when
          there's something to show — keeps the page clean for fresh
          installs while still giving operators a path back when they
          accidentally delete an engagement. */}
      {deleted.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <SectionLabel>Recently deleted</SectionLabel>
          <p
            style={{
              fontSize: 12,
              color: "var(--fg-muted)",
              margin: "6px 0 12px",
            }}
          >
            {deleted.length} engagement{deleted.length === 1 ? "" : "s"} in
            the recycle bin. Restore brings everything back; Delete forever
            cascades through every host, port, evidence, and finding row —
            unrecoverable.
          </p>
          <RecycleBinList engagements={deleted} />
        </section>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mono uppercase tracking-[0.08em] font-medium"
      style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
    >
      {children}
    </div>
  );
}

function SettingsLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: "12px 14px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--bg-2)",
        color: "var(--fg)",
        textDecoration: "none",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      <div
        style={{
          marginTop: 4,
          fontSize: 12,
          color: "var(--fg-muted)",
          lineHeight: 1.5,
        }}
      >
        {description}
      </div>
    </Link>
  );
}
