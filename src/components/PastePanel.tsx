"use client";

/**
 * PastePanel — nmap paste input (redesigned).
 *
 * Wrapped paste surface with fake window chrome at the top. The paste
 * textarea is flush inside the wrapper (no extra border — the chrome
 * provides the visual container).
 *
 * Action row (primary "Start engagement" with ⏎ kbd, "Clear", "Try sample")
 * and inline error handling are preserved from the previous implementation.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Copy, HelpCircle } from "lucide-react";

export function PastePanel() {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const router = useRouter();

  async function handleSubmit() {
    if (!input.trim()) {
      setError("Input is empty. Paste nmap output to continue.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nmap: input }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(
          data.error ||
            "Could not parse this input. Paste raw nmap text output or XML (-oN / -oX).",
        );
        return;
      }
      const data = await res.json();
      router.push(`/engagements/${data.id}`);
      router.refresh();
    } catch {
      setError(
        "Could not parse this input. Paste raw nmap text output or XML (-oN / -oX).",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSampleLoad() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/sample", { method: "POST" });
      if (!res.ok) {
        setError("Could not load sample engagement. Please try again.");
        return;
      }
      const data = await res.json();
      router.push(`/engagements/${data.id}`);
      router.refresh();
    } catch {
      setError("Could not load sample engagement. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div>
      {/* Paste surface with window chrome */}
      <div
        style={{
          position: "relative",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--bg-1)",
          overflow: "hidden",
        }}
      >
        <div
          className="flex items-center gap-2"
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-2)",
          }}
        >
          <div className="flex items-center gap-1">
            <Dot />
            <Dot />
            <Dot />
          </div>
          <span
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--fg-subtle)",
              marginLeft: 6,
            }}
          >
            ~/scans/paste.txt
          </span>
          <span
            className="ml-auto"
            style={{ fontSize: 11, color: "var(--fg-subtle)" }}
          >
            nmap · text/xml
          </span>
        </div>

        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder={`Nmap scan report for 10.10.10.3
Host is up (0.015s latency).
Not shown: 996 closed ports
PORT     STATE SERVICE     VERSION
21/tcp   open  ftp         vsftpd 2.3.4
...`}
          className="mono w-full"
          style={{
            minHeight: 168,
            padding: "14px 16px",
            background: "var(--bg-1)",
            color: "var(--fg)",
            border: 0,
            outline: "none",
            resize: "none",
            fontSize: 12.5,
            lineHeight: 1.55,
            display: "block",
          }}
        />
      </div>

      {/* How-to disclosure — nudges the operator to run a version+script scan
          so the heatmap risk and the stack/version conditional overlays have
          data to work with, then paste that output back here. */}
      <HowToScan open={showHelp} onToggle={() => setShowHelp((v) => !v)} />

      {/* Action row */}
      <div className="mt-[14px] flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="flex flex-1 items-center justify-center gap-2"
          style={{
            height: 36,
            padding: "0 14px",
            borderRadius: 5,
            background: "var(--accent)",
            color: "#05170d",
            border: "1px solid var(--accent)",
            fontWeight: 600,
            fontSize: 13,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Parsing…" : "Start engagement"}
          <Kbd dark>⏎</Kbd>
        </button>
        <button
          type="button"
          onClick={() => {
            setInput("");
            setError(null);
          }}
          disabled={loading || !input}
          style={secondaryBtn(loading || !input)}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleSampleLoad}
          disabled={loading}
          style={secondaryBtn(loading)}
        >
          Try sample
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3"
          style={{ fontSize: 12.5, color: "var(--risk-crit)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Collapsible "how to scan" helper. Recommends the nmap invocation that gives
 * recon-deck the most to work with — `-sV` version banners feed the version
 * conditionals (vsftpd/Samba/OpenSSH CVEs) and `-sC` default scripts feed the
 * stack conditionals (PHP/WordPress/Tomcat…), while `-oN` gives clean text to
 * paste back. The point is to turn a bare port list into a fingerprinted scan.
 */
function HowToScan({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mt-[10px]">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5"
        style={{
          padding: "4px 6px",
          marginLeft: -6,
          background: "transparent",
          border: 0,
          color: "var(--fg-subtle)",
          fontSize: 12,
          cursor: "pointer",
        }}
        aria-expanded={open}
      >
        <HelpCircle size={13} />
        <span>Which nmap scan should I paste?</span>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>

      {open && (
        <div
          className="mt-2"
          style={{
            padding: 14,
            borderRadius: 6,
            background: "var(--bg-1)",
            border: "1px solid var(--border)",
          }}
        >
          <p
            style={{
              fontSize: 12.5,
              color: "var(--fg-muted)",
              margin: "0 0 12px",
              lineHeight: 1.6,
            }}
          >
            recon-deck reads a bare port list, but it does far more with a{" "}
            <span style={{ color: "var(--fg)" }}>versioned, scripted</span> scan:
            service versions unlock CVE-specific steps (vsftpd 2.3.4, Samba
            usermap, OpenSSH…) and default-script output lets it auto-detect the
            web stack and tailor the checklist. Run one of these, then paste the
            output here.
          </p>

          <CommandRow
            label="Full — all ports, versions + default scripts (recommended)"
            command="nmap -sCV -p- --min-rate 1000 -oN nmap.txt <TARGET>"
          />
          <CommandRow
            label="Fast — top 1000 ports, same depth"
            command="nmap -sCV --top-ports 1000 -oN nmap.txt <TARGET>"
          />

          <p
            style={{
              fontSize: 11.5,
              color: "var(--fg-subtle)",
              margin: "10px 0 0",
              lineHeight: 1.55,
            }}
          >
            Paste the contents of{" "}
            <span className="mono" style={{ color: "var(--fg-muted)" }}>
              nmap.txt
            </span>{" "}
            above — or scan with{" "}
            <span className="mono" style={{ color: "var(--fg-muted)" }}>
              -oX nmap.xml
            </span>{" "}
            and paste the XML. Even richer: drop an AutoRecon results{" "}
            <span className="mono" style={{ color: "var(--fg-muted)" }}>
              .zip
            </span>{" "}
            on the Import panel.
          </p>
        </div>
      )}
    </div>
  );
}

function CommandRow({
  label,
  command,
}: {
  label: string;
  command: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the command is selectable in the field regardless */
    }
  }

  return (
    <div className="mt-2 first:mt-0">
      <div
        style={{
          fontSize: 11,
          color: "var(--fg-subtle)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        className="flex items-center gap-2"
        style={{
          padding: "7px 8px 7px 12px",
          borderRadius: 5,
          background: "var(--code, var(--bg-2))",
          border: "1px solid var(--border)",
        }}
      >
        <code
          className="mono"
          style={{
            flex: 1,
            fontSize: 12,
            color: "var(--fg)",
            overflowX: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy command"
          className="inline-flex items-center gap-1 shrink-0"
          style={{
            padding: "3px 8px",
            borderRadius: 4,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            color: copied ? "var(--accent)" : "var(--fg-muted)",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function secondaryBtn(disabled: boolean): React.CSSProperties {
  return {
    height: 36,
    padding: "0 14px",
    borderRadius: 5,
    background: "var(--bg-2)",
    color: "var(--fg)",
    border: "1px solid var(--border)",
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

function Dot() {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "#3a3b40",
        display: "inline-block",
      }}
    />
  );
}

function Kbd({
  children,
  dark = false,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <span
      className="mono inline-flex items-center justify-center"
      style={{
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: 3,
        background: dark ? "rgba(5,23,13,0.2)" : "var(--bg-3)",
        border: dark
          ? "1px solid rgba(5,23,13,0.3)"
          : "1px solid var(--border)",
        borderBottomWidth: 2,
        fontSize: 10,
        color: dark ? "#05170d" : "var(--fg-muted)",
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}
