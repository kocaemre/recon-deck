import { describe, it, expect } from "vitest";
import { parseNmapXml } from "../nmap-xml";

/** Minimal XML harness — wraps a host body in a valid <nmaprun>. */
function wrap(hostBody: string, attrs = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<nmaprun scanner="nmap" args="nmap -sV -A 10.10.10.5" version="7.94" xmloutputversion="1.05" start="1714000000"${attrs}>
${hostBody}
<runstats><finished time="1714000042" elapsed="42.5" summary="Nmap done at ..." exit="success"/><hosts up="1" down="0" total="1"/></runstats>
</nmaprun>`;
}

describe("nmap-xml v2 enrichment", () => {
  it("extracts <extraports> with state + count + reasons", () => {
    const xml = wrap(`
<host>
  <status state="up" reason="echo-reply"/>
  <address addr="10.10.10.5" addrtype="ipv4"/>
  <ports>
    <extraports state="closed" count="996">
      <extrareasons reason="resets" count="996"/>
    </extraports>
    <extraports state="filtered" count="2">
      <extrareasons reason="no-responses" count="2"/>
    </extraports>
    <port portid="22" protocol="tcp">
      <state state="open" reason="syn-ack" reason_ttl="64"/>
      <service name="ssh"/>
    </port>
  </ports>
</host>`);
    const result = parseNmapXml(xml);
    expect(result.extraPorts).toHaveLength(2);
    expect(result.extraPorts?.[0]).toEqual({
      state: "closed",
      count: 996,
      reasons: [{ reason: "resets", count: 996 }],
    });
    expect(result.extraPorts?.[1].state).toBe("filtered");
  });

  it("extracts port reason + reason_ttl + cpe + servicefp", () => {
    const xml = wrap(`
<host>
  <address addr="10.10.10.5" addrtype="ipv4"/>
  <ports>
    <port portid="80" protocol="tcp">
      <state state="open" reason="syn-ack" reason_ttl="63"/>
      <service name="http" product="Apache" version="2.4.52" servicefp="SF-Port80-TCP:V=7.94...">
        <cpe>cpe:/a:apache:http_server:2.4.52</cpe>
        <cpe>cpe:/o:linux:linux_kernel</cpe>
      </service>
    </port>
  </ports>
</host>`);
    const result = parseNmapXml(xml);
    expect(result.ports[0].reason).toBe("syn-ack");
    expect(result.ports[0].reasonTtl).toBe(63);
    expect(result.ports[0].cpe).toEqual([
      "cpe:/a:apache:http_server:2.4.52",
      "cpe:/o:linux:linux_kernel",
    ]);
    expect(result.ports[0].serviceFp).toContain("SF-Port80-TCP");
  });

  it("extracts OS matches with osclass + osfingerprint", () => {
    const xml = wrap(`
<host>
  <address addr="10.10.10.5" addrtype="ipv4"/>
  <ports>
    <port portid="22" protocol="tcp"><state state="open"/><service name="ssh"/></port>
  </ports>
  <os>
    <osmatch name="Linux 4.15 - 5.6" accuracy="98">
      <osclass type="general purpose" vendor="Linux" osfamily="Linux" osgen="4.X" accuracy="98"/>
    </osmatch>
    <osmatch name="Linux 4.4" accuracy="96"/>
    <osfingerprint fingerprint="OS:SCAN(V=7.94..."/>
  </os>
</host>`);
    const result = parseNmapXml(xml);
    expect(result.os?.matches).toHaveLength(2);
    expect(result.os?.matches?.[0].name).toBe("Linux 4.15 - 5.6");
    expect(result.os?.matches?.[0].accuracy).toBe(98);
    expect(result.os?.matches?.[0].classes?.[0]).toMatchObject({
      vendor: "Linux",
      family: "Linux",
      gen: "4.X",
    });
    expect(result.os?.fingerprint).toContain("OS:SCAN");
    expect(result.os?.name).toBe("Linux 4.15 - 5.6");
    expect(result.os?.accuracy).toBe(98);
  });

  it("extracts traceroute hops", () => {
    const xml = wrap(`
<host>
  <address addr="10.10.10.5" addrtype="ipv4"/>
  <ports><port portid="22" protocol="tcp"><state state="open"/><service name="ssh"/></port></ports>
  <trace proto="tcp" port="80">
    <hop ttl="1" rtt="0.42" ipaddr="10.10.14.1"/>
    <hop ttl="2" rtt="1.21" ipaddr="10.10.10.5" host="box.htb"/>
  </trace>
</host>`);
    const result = parseNmapXml(xml);
    expect(result.traceroute?.proto).toBe("tcp");
    expect(result.traceroute?.port).toBe(80);
    expect(result.traceroute?.hops).toHaveLength(2);
    expect(result.traceroute?.hops[1]).toEqual({
      ttl: 2,
      rtt: 1.21,
      ipaddr: "10.10.10.5",
      host: "box.htb",
    });
  });

  it("extracts scanner meta + runstats", () => {
    const xml = wrap(`
<host>
  <address addr="10.10.10.5" addrtype="ipv4"/>
  <ports><port portid="22" protocol="tcp"><state state="open"/><service name="ssh"/></port></ports>
</host>`);
    const result = parseNmapXml(xml);
    expect(result.scanner?.name).toBe("nmap");
    expect(result.scanner?.version).toBe("7.94");
    expect(result.scanner?.args).toContain("nmap -sV -A");
    expect(result.scanner?.xmlVersion).toBe("1.05");
    expect(result.runstats?.elapsed).toBe(42.5);
    expect(result.runstats?.exitStatus).toBe("success");
    expect(result.runstats?.hosts?.up).toBe(1);
    expect(result.runstats?.finishedAt).toBeTruthy();
  });

  it("extracts multiple addresses and hostnames", () => {
    const xml = wrap(`
<host>
  <status state="up"/>
  <address addr="10.10.10.5" addrtype="ipv4"/>
  <address addr="fe80::1" addrtype="ipv6"/>
  <address addr="DE:AD:BE:EF:00:01" addrtype="mac" vendor="Acme"/>
  <hostnames>
    <hostname name="box.htb" type="user"/>
    <hostname name="box.example.com" type="PTR"/>
  </hostnames>
  <ports><port portid="22" protocol="tcp"><state state="open"/><service name="ssh"/></port></ports>
</host>`);
    const result = parseNmapXml(xml);
    expect(result.target.addresses).toHaveLength(3);
    expect(result.target.hostnames).toHaveLength(2);
    expect(result.target.state).toBe("up");
    expect(result.target.addresses?.[2]).toMatchObject({
      addrtype: "mac",
      vendor: "Acme",
    });
  });

  it("extracts pre/post script outputs", () => {
    const xml = `<?xml version="1.0"?>
<nmaprun start="1714000000">
  <prescript>
    <script id="targets-asn" output="ASN data..."/>
  </prescript>
  <host>
    <address addr="10.10.10.5" addrtype="ipv4"/>
    <ports><port portid="22" protocol="tcp"><state state="open"/><service name="ssh"/></port></ports>
  </host>
  <postscript>
    <script id="reverse-index" output="80/tcp..."/>
  </postscript>
</nmaprun>`;
    const result = parseNmapXml(xml);
    expect(result.preScripts?.[0].id).toBe("targets-asn");
    expect(result.postScripts?.[0].id).toBe("reverse-index");
  });
});
