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

  it("multi-host: every distinct IP becomes its own ParsedHost", () => {
    const grep = `# Nmap 7.94 scan initiated
Host: 10.10.10.5 (box1.htb) Ports: 22/open/tcp//ssh//OpenSSH/
Host: 10.10.10.6 () Ports: 80/open/tcp//http//nginx/
Host: 10.10.10.7 (box3.htb) Ports: 443/open/tcp//ssl|http//Apache/
`;
    const result = parseNmapGreppable(grep);
    expect(result.hosts).toHaveLength(3);
    expect(result.hosts.map((h) => h.target.ip)).toEqual([
      "10.10.10.5",
      "10.10.10.6",
      "10.10.10.7",
    ]);
    expect(result.hosts[0].target.hostname).toBe("box1.htb");
    expect(result.hosts[0].ports[0].port).toBe(22);
    expect(result.hosts[1].target.hostname).toBeUndefined();
    expect(result.hosts[1].ports[0].port).toBe(80);
    expect(result.hosts[2].ports[0].port).toBe(443);
    // Top-level mirrors hosts[0]
    expect(result.target.ip).toBe("10.10.10.5");
    expect(result.warnings.some((w) => /additional host/i.test(w))).toBe(false);
  });

  it("multi-host: Status: + Ports: lines for the same IP merge into one host", () => {
    const grep = `# Nmap 7.94 scan initiated
Host: 10.10.10.5 (box1.htb)\tStatus: Up
Host: 10.10.10.5 (box1.htb)\tPorts: 22/open/tcp//ssh//OpenSSH/, 80/open/tcp//http//nginx/\tIgnored State: closed (998)
Host: 10.10.10.6 ()\tStatus: Up
Host: 10.10.10.6 ()\tPorts: 3306/open/tcp//mysql//MariaDB/\tIgnored State: closed (999)
`;
    const result = parseNmapGreppable(grep);
    expect(result.hosts).toHaveLength(2);
    expect(result.hosts[0].ports.map((p) => p.port).sort((a, b) => a - b)).toEqual([22, 80]);
    expect(result.hosts[0].extraPorts?.[0]).toMatchObject({ state: "closed", count: 998 });
    expect(result.hosts[1].ports[0].port).toBe(3306);
    expect(result.hosts[1].extraPorts?.[0]).toMatchObject({ state: "closed", count: 999 });
  });

  it("throws on input without Host: line", () => {
    expect(() => parseNmapGreppable("# Nmap 7.94 scan initiated\n")).toThrow(
      /No 'Host:' line/i,
    );
  });
});
