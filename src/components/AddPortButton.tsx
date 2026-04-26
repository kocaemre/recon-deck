"use client";

/**
 * AddPortButton — opens a modal to manually add a port to the engagement.
 *
 * Used when nmap missed a service the pentester discovered through other
 * means (DNS zone transfer, kerberos pre-auth probe, banner grab from a
 * non-default port, etc.).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

interface AddPortButtonProps {
  engagementId: number;
  /**
   * Active host (multi-host engagement). When set, the manual port is bound
   * to this host. Single-host engagements can omit; the API falls back to
   * the engagement's primary host.
   */
  activeHostId?: number | null;
}

export function AddPortButton({
  engagementId,
  activeHostId,
}: AddPortButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5"
        style={{
          height: 24,
          padding: "0 8px",
          borderRadius: 5,
          background: "var(--bg-2)",
          color: "var(--fg-muted)",
          border: "1px solid var(--border)",
          fontSize: 11.5,
          fontWeight: 500,
          cursor: "pointer",
        }}
        title="Add a port nmap didn't catch"
      >
        <Plus size={11} />
        Add port
      </button>
      {open && (
        <AddPortModal
          engagementId={engagementId}
          activeHostId={activeHostId ?? null}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AddPortModal({
  engagementId,
  activeHostId,
  onClose,
}: {
  engagementId: number;
  activeHostId: number | null;
  onClose: () => void;
}) {
  const [port, setPort] = useState("");
  const [protocol, setProtocol] = useState<"tcp" | "udp">("tcp");
  const [service, setService] = useState("");
  const [version, setVersion] = useState("");
  const [tunnelSsl, setTunnelSsl] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save() {
    const portNum = parseInt(port, 10);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      toast.error("Port must be 1-65535.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/ports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: portNum,
          protocol,
          service: service.trim() || null,
          version: version.trim() || null,
          tunnel: tunnelSsl ? "ssl" : null,
          ...(activeHostId !== null ? { hostId: activeHostId } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Add failed.");
        return;
      }
      toast.success(`${portNum}/${protocol} added`);
      router.refresh();
      onClose();
    } catch {
      toast.error("Add failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 65,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        display: "grid",
        placeItems: "start center",
        paddingTop: 80,
      }}
    >
      <div
        style={{
          width: 420,
          background: "var(--bg-2)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div
          className="flex items-center"
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span
            className="uppercase tracking-[0.08em] font-medium"
            style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
          >
            Add manual port
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              marginLeft: "auto",
              width: 22,
              height: 22,
              display: "grid",
              placeItems: "center",
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--bg-3)",
              color: "var(--fg-muted)",
              cursor: "pointer",
            }}
          >
            <X size={12} />
          </button>
        </div>
        <div className="flex flex-col gap-3" style={{ padding: 14 }}>
          <div className="flex gap-3">
            <Field label="Port" style={{ flex: 1 }}>
              <input
                autoFocus
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="e.g. 8080"
                style={inputStyle}
                min={1}
                max={65535}
              />
            </Field>
            <Field label="Protocol" style={{ width: 120 }}>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as "tcp" | "udp")}
                style={inputStyle}
              >
                <option value="tcp">tcp</option>
                <option value="udp">udp</option>
              </select>
            </Field>
          </div>
          <Field label="Service (optional)">
            <input
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="e.g. http, ldap, redis"
              style={inputStyle}
            />
          </Field>
          <Field label="Version / banner (optional)">
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. nginx 1.18.0"
              style={inputStyle}
            />
          </Field>
          <label
            className="flex items-center gap-2"
            style={{ fontSize: 12, color: "var(--fg-muted)", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={tunnelSsl}
              onChange={(e) => setTunnelSsl(e.target.checked)}
            />
            tunnel = ssl (HTTPS / encrypted variant)
          </label>
        </div>
        <div
          className="flex items-center gap-2"
          style={{
            padding: "10px 14px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-1)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={btnSecondary(saving)}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !port}
            style={{ ...btnPrimary(saving || !port), marginLeft: "auto" }}
          >
            {saving ? "Adding…" : "Add port"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  background: "var(--bg-1)",
  border: "1px solid var(--border)",
  borderRadius: 5,
  color: "var(--fg)",
  fontSize: 13,
  outline: "none",
};

function btnSecondary(disabled: boolean): React.CSSProperties {
  return {
    height: 30,
    padding: "0 12px",
    borderRadius: 5,
    background: "var(--bg-2)",
    color: "var(--fg)",
    border: "1px solid var(--border)",
    fontSize: 12.5,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    height: 30,
    padding: "0 14px",
    borderRadius: 5,
    background: "var(--accent)",
    color: "#05170d",
    border: "1px solid var(--accent)",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
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
        style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginBottom: 4 }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
