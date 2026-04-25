import { describe, it, expect } from "vitest";
import { parseNmapGreppable } from "../nmap-greppable";
import { parseAny } from "../index";

describe("nmap-greppable parser", () => {
  it("parses Host: line with ip + hostname + ports", () => {
    const grep = `# Nmap 7.94 scan initiated as: nmap -oG out 10.10.10.5
Host: 10.10.10.5 (box.htb) Status: Up
Host: 10.10.10.5 (box.htb) Ports: 22/open/tcp//ssh//OpenSSH 8.9p1/, 80/open/tcp//http//Apache 2.4.52/  Ignored State: closed (998)
# Nmap done
`;
    const result = parseNmapGreppable(grep);
    expect(result.target.ip).toBe("10.10.10.5");
    expect(result.target.hostname).toBe("box.htb");
    expect(result.ports).toHaveLength(2);
    expect(result.ports[0]).toMatchObject({
      port: 22,
      protocol: "tcp",
      state: "open",
      service: "ssh",
      version: "OpenSSH 8.9p1",
    });
    expect(result.extraPorts).toEqual([{ state: "closed", count: 998 }]);
  });

  it("dispatcher routes greppable input through parseAny", () => {
    const grep = `# Nmap 7.94 scan initiated as: nmap -oG out 10.10.10.5
Host: 10.10.10.5 () Ports: 22/open/tcp//ssh//OpenSSH/
`;
    const result = parseAny(grep);
    expect(result.ports).toHaveLength(1);
  });

  it("P1-F PR 2: greppable still binds to first host but no longer warns", () => {
    // Greppable multi-host parsing is deferred (text scans rarely cover
    // multiple hosts; users with that need can switch to -oX). The parser
    // silently sticks to the first host. Asserting that the legacy
    // additional-host warning is *gone* keeps the new contract honest.
    const grep = `# Nmap 7.94 scan initiated
Host: 10.10.10.5 () Ports: 22/open/tcp//ssh//OpenSSH/
Host: 10.10.10.6 () Ports: 80/open/tcp//http//nginx/
`;
    const result = parseNmapGreppable(grep);
    expect(result.target.ip).toBe("10.10.10.5");
    expect(result.warnings.some((w) => /additional host/i.test(w))).toBe(
      false,
    );
    expect(result.hosts).toHaveLength(1);
  });

  it("throws on input without Host: line", () => {
    expect(() => parseNmapGreppable("# Nmap 7.94 scan initiated\n")).toThrow(
      /No 'Host:' line/i,
    );
  });
});
