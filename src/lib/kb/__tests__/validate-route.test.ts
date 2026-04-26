import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// invalidateKb is the only side-effect on the cached singleton — mock
// it so the route test doesn't need to fight Next.js module caching.
// `vi.hoisted` is required because `vi.mock` is hoisted to the top of
// the module: a plain `const` would be in a temporal dead zone when
// the factory runs.
const { invalidateMock } = vi.hoisted(() => ({
  invalidateMock: vi.fn(),
}));
vi.mock("@/lib/kb", async () => {
  const actual =
    await vi.importActual<typeof import("../index.js")>("@/lib/kb");
  return {
    ...actual,
    invalidateKb: invalidateMock,
  };
});

import { POST } from "../../../../app/api/kb/validate/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/kb/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_YAML = `schema_version: 1
port: 80
service: http
protocol: tcp
aliases: []
risk: medium
checks: []
commands: []
resources: []
known_vulns: []
`;

let userDir: string | null = null;
let prevEnv: string | undefined;

beforeEach(() => {
  invalidateMock.mockClear();
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-validate-"));
  prevEnv = process.env.RECON_KB_USER_DIR;
});

afterEach(() => {
  if (userDir) fs.rmSync(userDir, { recursive: true, force: true });
  if (prevEnv === undefined) delete process.env.RECON_KB_USER_DIR;
  else process.env.RECON_KB_USER_DIR = prevEnv;
});

describe("POST /api/kb/validate", () => {
  it("returns 400 on missing yaml field", async () => {
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/yaml/i);
  });

  it("returns 422 on invalid YAML syntax", async () => {
    const res = await POST(makeRequest({ yaml: "key: : :" }) as never);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/invalid yaml/i);
  });

  it("returns 422 on schema mismatch", async () => {
    const res = await POST(
      makeRequest({ yaml: "schema_version: 99\nport: 80\nservice: http\n" }) as never,
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/schema validation/i);
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 200 + entry summary on dry-run validate", async () => {
    const res = await POST(makeRequest({ yaml: VALID_YAML }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.entry.port).toBe(80);
    expect(body.entry.service).toBe("http");
    expect(body.entry.protocol).toBe("tcp");
    expect(body.saved).toBeUndefined();
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it("rejects save when RECON_KB_USER_DIR is unset", async () => {
    delete process.env.RECON_KB_USER_DIR;
    const res = await POST(
      makeRequest({ yaml: VALID_YAML, save: true, filename: "x" }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/RECON_KB_USER_DIR/);
  });

  it("rejects save with traversal-prone filename", async () => {
    process.env.RECON_KB_USER_DIR = userDir!;
    const res = await POST(
      makeRequest({
        yaml: VALID_YAML,
        save: true,
        filename: "../escape",
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid filename/i);
  });

  it("writes the file and invalidates the cache on save", async () => {
    process.env.RECON_KB_USER_DIR = userDir!;
    const res = await POST(
      makeRequest({
        yaml: VALID_YAML,
        save: true,
        filename: "custom-http",
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe(true);
    expect(body.path).toBe(path.resolve(userDir!, "custom-http.yaml"));
    expect(fs.readFileSync(body.path, "utf8")).toBe(VALID_YAML);
    expect(invalidateMock).toHaveBeenCalledTimes(1);
  });

  it("strips trailing .yaml from operator-supplied filename", async () => {
    process.env.RECON_KB_USER_DIR = userDir!;
    const res = await POST(
      makeRequest({
        yaml: VALID_YAML,
        save: true,
        filename: "with-extension.yaml",
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Single .yaml suffix — not double.
    expect(body.path).toBe(
      path.resolve(userDir!, "with-extension.yaml"),
    );
    expect(fs.existsSync(body.path)).toBe(true);
  });
});
