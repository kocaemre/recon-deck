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
import {
  db,
  listSummaries,
  listDeletedSummaries,
  effectiveAppState,
} from "@/lib/db";
import { EngagementSettingsList } from "@/components/EngagementSettingsList";
import { RecycleBinList } from "@/components/RecycleBinList";
import { EditorIntegrationToggle } from "@/components/EditorIntegrationToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OnboardingSettingsSection } from "@/components/OnboardingSettingsSection";
import { detectToolPaths } from "@/lib/tool-paths";
import pkg from "../../../package.json";

export const dynamic = "force-dynamic";

export default function SettingsIndexPage() {
  const engagements = listSummaries(db);
  const deleted = listDeletedSummaries(db);
  const cfg = effectiveAppState(db);
  const tools = detectToolPaths();
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

      {/* #9: external tool path detection. Read-only — surfaces what we
          found at common install locations so operators don't have to
          hunt for paths. Wordlists/searchsploit defaults can still be
          overridden via the existing /settings/wordlists editor and the
          KB lookup binary itself. */}
      <section style={{ marginBottom: 32 }}>
        <SectionLabel>Detected tools</SectionLabel>
        <p
          style={{
            fontSize: 12,
            color: "var(--fg-muted)",
            margin: "6px 0 12px",
          }}
        >
          Common install locations probed at request time.{" "}
          <span className="mono">Not found</span> means recon-deck
          couldn{"’"}t locate the tool — install via apt / git clone
          or override individual wordlist paths in{" "}
          <Link
            href="/settings/wordlists"
            style={{ color: "var(--accent)", textDecoration: "underline" }}
          >
            Wordlists
          </Link>
          .
        </p>
        {tools.inDocker &&
          !tools.seclists &&
          !tools.dirb &&
          !tools.dirbuster && (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-2)",
                fontSize: 12,
                color: "var(--fg-muted)",
                lineHeight: 1.5,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--fg-subtle)",
                  marginBottom: 6,
                }}
              >
                Container detected
              </div>
              Host wordlist paths aren{"’"}t visible from inside the
              recon-deck container without a bind mount. Re-run{" "}
              <code className="mono">docker run</code> with{" "}
              <code className="mono">
                -v /usr/share/wordlists:/host/wordlists:ro
              </code>{" "}
              and the rows below will populate.
            </div>
          )}
        <div
          className="grid grid-cols-1 gap-2"
          style={{ fontSize: 12.5 }}
        >
          <DetectedRow label="searchsploit" value={tools.searchsploit} />
          <DetectedRow label="SecLists" value={tools.seclists} />
          <DetectedRow label="dirb wordlists" value={tools.dirb} />
          <DetectedRow label="dirbuster wordlists" value={tools.dirbuster} />
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

      {/* v2.3.0 #3: theme tri-state toggle. */}
      <section style={{ marginBottom: 32 }}>
        <SectionLabel>Display</SectionLabel>
        <p
          style={{
            fontSize: 12,
            color: "var(--fg-muted)",
            margin: "6px 0 12px",
          }}
        >
          Pick how recon-deck should render. <code className="mono">System</code>{" "}
          follows your OS preference; explicit choices override it. Print
          stylesheet always renders light regardless.
        </p>
        <ThemeToggle initial={cfg.theme} />
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

      {/* v1.9.0: first-run / onboarding controls. */}
      <section style={{ marginBottom: 32 }}>
        <SectionLabel>First-run</SectionLabel>
        <p
          style={{
            fontSize: 12,
            color: "var(--fg-muted)",
            margin: "6px 0 12px",
          }}
        >
          Replay the welcome flow or toggle the GitHub release check. Both
          live in the local <code className="mono">app_state</code> singleton.
        </p>
        <OnboardingSettingsSection
          initialUpdateCheck={cfg.updateCheck}
          currentVersion={pkg.version}
        />
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

function DetectedRow({
  label,
  value,
}: {
  label: string;
  value: { path: string; source: string } | null;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3"
      style={{
        padding: "10px 12px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--bg-2)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: value ? "var(--accent)" : "var(--fg-subtle)",
            opacity: value ? 1 : 0.5,
          }}
        />
        <span style={{ fontWeight: 500 }}>{label}</span>
      </div>
      {value ? (
        <div className="flex items-center gap-2 min-w-0">
          <code
            className="mono truncate"
            style={{
              fontSize: 12,
              color: "var(--fg-muted)",
              maxWidth: 360,
            }}
            title={value.path}
          >
            {value.path}
          </code>
          <span
            style={{
              fontSize: 11,
              color: "var(--fg-subtle)",
              whiteSpace: "nowrap",
            }}
          >
            {value.source}
          </span>
        </div>
      ) : (
        <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
          Not found
        </span>
      )}
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
