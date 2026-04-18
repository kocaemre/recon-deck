import "server-only";

import type { ParsedScan } from "@/lib/parser/types";

/**
 * Hard-coded HTB-easy sample engagement (UI-10).
 *
 * Used by `app/api/sample/route.ts` to create a "Try with sample" engagement
 * in a single click. Ports chosen to exercise the seeded KB (Phase 1) so the
 * resulting engagement shows real KB commands, checks, and resources — not
 * the bare default.yaml fallback.
 *
 * Target: sample.htb (10.10.10.123). engagement-repo.generateName produces
 * "sample.htb (10.10.10.123)" — a stable, recognizable name.
 *
 * Source enum: "nmap-xml" (no migration; schema enum is locked since Phase 3).
 *
 * Idempotency: NONE. Repeated /api/sample calls create duplicates — matches
 * the `/api/scan` paste flow per Pitfall 9 / Open Decision #1. Users delete
 * duplicates manually if they accumulate.
 *
 * Per Pattern 5 + Pattern 6: structured `<elem>` data is intentionally NOT
 * surfaced here. The sample's port-level scripts use plain `output` strings
 * only. The hostscript carries plain output too; structured rendering is
 * exercised by the structured-nse.xml fixture in Plan 07-01, not the sample.
 * Reason: the re-parse path in Plan 07-04 only fires when
 * `engagement.raw_input` is real XML; sample's raw_input is a marker string,
 * so the try/catch fallback returns no structured data — UX still works,
 * fallback to <pre>.
 *
 * Server-only: the literal weighs ~3 KB; first-line `import "server-only"`
 * keeps it out of the client bundle (ARCHITECTURE.md < 2 MB target).
 */
export function buildSampleScan(): ParsedScan {
  return {
    target: { ip: "10.10.10.123", hostname: "sample.htb" },
    source: "nmap-xml",
    warnings: [],
    ports: [
      {
        port: 21,
        protocol: "tcp",
        state: "open",
        service: "ftp",
        product: "vsftpd",
        version: "3.0.3",
        scripts: [
          {
            id: "ftp-anon",
            output: "Anonymous FTP login allowed (FTP code 230)",
          },
        ],
      },
      {
        port: 22,
        protocol: "tcp",
        state: "open",
        service: "ssh",
        product: "OpenSSH",
        version: "8.2p1 Ubuntu 4ubuntu0.5",
        scripts: [
          {
            id: "ssh-hostkey",
            output:
              "  2048 SHA256:abc123def456 (RSA)\n  256 SHA256:xyz789 (ED25519)",
          },
        ],
      },
      {
        port: 25,
        protocol: "tcp",
        state: "open",
        service: "smtp",
        product: "Postfix smtpd",
        scripts: [
          {
            id: "smtp-commands",
            output:
              "sample.htb, PIPELINING, SIZE 10240000, VRFY, ETRN, STARTTLS, ENHANCEDSTATUSCODES, 8BITMIME, DSN",
          },
        ],
      },
      {
        port: 53,
        protocol: "tcp",
        state: "open",
        service: "dns",
        product: "ISC BIND",
        version: "9.16.1",
        scripts: [
          { id: "dns-recursion", output: "Recursion appears to be enabled" },
        ],
      },
      {
        port: 80,
        protocol: "tcp",
        state: "open",
        service: "http",
        product: "Apache httpd",
        version: "2.4.41",
        scripts: [
          { id: "http-title", output: "Welcome to sample.htb" },
          { id: "http-server-header", output: "Apache/2.4.41 (Ubuntu)" },
        ],
      },
      {
        port: 110,
        protocol: "tcp",
        state: "open",
        service: "pop3",
        product: "Dovecot pop3d",
        scripts: [
          {
            id: "pop3-capabilities",
            output: "USER PIPELINING UIDL TOP STLS RESP-CODES SASL CAPA",
          },
        ],
      },
      {
        port: 139,
        protocol: "tcp",
        state: "open",
        service: "netbios-ssn",
        product: "Samba smbd",
        version: "4.6.2",
        scripts: [],
      },
      {
        port: 443,
        protocol: "tcp",
        state: "open",
        service: "http",
        tunnel: "ssl",
        product: "Apache httpd",
        version: "2.4.41",
        scripts: [
          {
            id: "ssl-cert",
            output:
              "Subject: commonName=sample.htb\nIssuer: commonName=sample.htb\nNot valid before: 2025-01-01T00:00:00\nNot valid after: 2026-01-01T00:00:00",
          },
        ],
      },
      {
        port: 445,
        protocol: "tcp",
        state: "open",
        service: "microsoft-ds",
        product: "Samba smbd",
        version: "4.6.2",
        scripts: [
          {
            id: "smb2-security-mode",
            output: "3.1.1: Message signing enabled but not required",
          },
        ],
      },
      {
        port: 3306,
        protocol: "tcp",
        state: "open",
        service: "mysql",
        product: "MySQL",
        version: "5.7.31",
        scripts: [
          {
            id: "mysql-info",
            output:
              "Protocol: 10\nVersion: 5.7.31-0ubuntu0.18.04.1\nThread ID: 27\nCapabilities flags: 65535",
          },
        ],
      },
    ],
    hostScripts: [
      {
        id: "smb-os-discovery",
        output:
          "OS: Windows 10 Pro 19042 (Windows 10 Pro 6.3)\nComputer name: sample\nNetBIOS computer name: SAMPLE\nDomain name: sample.htb\nFQDN: sample.sample.htb\nSystem time: 2026-04-18T12:00:00+00:00",
      },
    ],
  };
}
