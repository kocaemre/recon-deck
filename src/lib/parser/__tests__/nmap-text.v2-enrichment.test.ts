import { describe, it, expect } from "vitest";
import { parseNmapText } from "../nmap-text";

describe("nmap-text v2 enrichment", () => {
  it("captures 'Not shown:' line into extraPorts", () => {
    const text = `Nmap scan report for 10.10.10.5
Host is up (0.015s latency).
Not shown: 996 closed tcp ports (reset)
PORT     STATE SERVICE     VERSION
22/tcp   open  ssh         OpenSSH 8.9p1
`;
    const result = parseNmapText(text);
    expect(result.extraPorts).toEqual([{ state: "closed", count: 996 }]);
  });

  it("flattens multi-state 'Not shown:' line", () => {
    const text = `Nmap scan report for 10.10.10.5
Host is up.
Not shown: 65530 filtered tcp ports (no-response), 1 closed tcp port (reset)
PORT     STATE SERVICE
22/tcp   open  ssh
`;
    const result = parseNmapText(text);
    expect(result.extraPorts).toEqual([
      { state: "filtered", count: 65530 },
      { state: "closed", count: 1 },
    ]);
  });

  it("splits ssl/<svc> compound service into tunnel='ssl' + bare service", () => {
    const text = `Nmap scan report for 10.10.10.5
Host is up.
PORT      STATE SERVICE   VERSION
8443/tcp  open  ssl/http  Apache
`;
    const result = parseNmapText(text);
    expect(result.ports[0].service).toBe("http");
    expect(result.ports[0].tunnel).toBe("ssl");
  });

  it("captures 'OS details:' as os.matches", () => {
    const text = `Nmap scan report for 10.10.10.5
Host is up.
PORT  STATE SERVICE
22/tcp open ssh
OS details: Linux 4.15 - 5.6
`;
    const result = parseNmapText(text);
    expect(result.os?.name).toBe("Linux 4.15 - 5.6");
    expect(result.os?.matches?.[0].name).toBe("Linux 4.15 - 5.6");
  });

  it("captures 'Aggressive OS guesses:' with accuracies", () => {
    const text = `Nmap scan report for 10.10.10.5
Host is up.
PORT  STATE SERVICE
22/tcp open ssh
Aggressive OS guesses: Linux 4.15 (95%), Linux 4.4 (94%)
`;
    const result = parseNmapText(text);
    expect(result.os?.matches).toHaveLength(2);
    expect(result.os?.matches?.[0]).toEqual({ name: "Linux 4.15", accuracy: 95 });
    expect(result.os?.name).toBe("Linux 4.15");
  });

  it("captures TRACEROUTE block hops", () => {
    const text = `Nmap scan report for 10.10.10.5
Host is up.
PORT  STATE SERVICE
22/tcp open ssh
TRACEROUTE (using port 80/tcp)
HOP RTT      ADDRESS
1   1.21 ms 10.10.14.1
2   2.34 ms 10.10.10.5 (box.htb)
`;
    const result = parseNmapText(text);
    expect(result.traceroute?.proto).toBe("tcp");
    expect(result.traceroute?.hops).toHaveLength(2);
    expect(result.traceroute?.hops[1]).toEqual({
      ttl: 2,
      rtt: 2.34,
      ipaddr: "10.10.10.5",
      host: "box.htb",
    });
  });
});
