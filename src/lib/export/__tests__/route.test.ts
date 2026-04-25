/**
 * Integration tests for GET /api/engagements/[id]/export/[format] (Phase 6, Plan 06-06).
 *
 * Covers:
 *  - Success paths for markdown/json/html (200 + correct Content-Type + correct body).
 *  - RFC 6266 Content-Disposition discipline (filename= appears BEFORE filename*=).
 *  - Filename pattern `<ip>-YYYY-MM-DD.<ext>` (EXPORT-05, D-21).
 *  - Cache-Control: no-store.
 *  - Dispatch exhaustiveness — the format → generator mapping that the client
 *    dropdown depends on (Warning 1 resolution: there is no unit test for the
 *    DropdownMenu itself because @testing-library/react is not installed; the
 *    dispatch contract is the only automated signal Task 2 ships with).
 *  - Error paths: 400 invalid id, 400 unknown format, 404 missing engagement,
 *    500 with generic message when a generator throws (no stack leak).
 *
 * Mocks the DB layer, the KB loader, the view-model transform, and each of the
 * three format generators (by FULL PATH, matching the route.ts imports — there
 * is deliberately no barrel at `src/lib/export/index.ts`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB layer BEFORE importing the route — vitest hoists vi.mock calls.
vi.mock("@/lib/db", () => ({
  db: {},
  getById: vi.fn(),
  getWordlistOverridesMap: vi.fn(() => ({})),
}));

// Mock the KB loader so no real YAML reads occur during tests.
vi.mock("@/lib/kb", () => ({
  loadKnowledgeBase: () => ({}),
  matchPort: () => ({
    commands: [],
    checks: [],
    resources: [],
    risk: "low",
    aliases: [],
    default_creds: [],
    quick_facts: [],
    known_vulns: [],
  }),
}));

// Mock the generators by FULL PATH — matches route.ts imports. No barrel.
vi.mock("@/lib/export/view-model", () => ({
  loadEngagementForExport: vi.fn((eng: unknown) => ({
    engagement: eng,
    ports: [],
    hostScripts: [],
    totalChecks: 0,
    doneChecks: 0,
    coverage: 0,
    warnings: [],
    recon_deck_version: "0.0.0-test",
  })),
}));
vi.mock("@/lib/export/markdown", () => ({
  generateMarkdown: vi.fn(() => "# md body"),
}));
vi.mock("@/lib/export/json", () => ({
  generateJson: vi.fn(() => "{}"),
}));
vi.mock("@/lib/export/html", () => ({
  generateHtml: vi.fn(() => "<!DOCTYPE html>"),
}));

import { GET } from "../../../../app/api/engagements/[id]/export/[format]/route";
import { getById } from "@/lib/db";
import { generateMarkdown } from "@/lib/export/markdown";
import { generateJson } from "@/lib/export/json";
import { generateHtml } from "@/lib/export/html";

const FIXTURE_ENG = {
  id: 1,
  name: "box.htb",
  target_ip: "10.10.10.5",
  target_hostname: null,
  source: "nmap-xml" as const,
  raw_input: "",
  warnings_json: "[]",
  os_name: null,
  os_accuracy: null,
  scanned_at: null,
  created_at: "2026-04-17T00:00:00.000Z",
  updated_at: "2026-04-17T00:00:00.000Z",
  ports: [],
  hostScripts: [],
};

function makeReq(): any {
  return new Request("http://localhost/");
}

function makeParams(id: string, format: string) {
  return { params: Promise.resolve({ id, format }) };
}

describe("GET /api/engagements/[id]/export/[format]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Success path (EXPORT-05)", () => {
    it("returns 200 + text/markdown for format=markdown", async () => {
      vi.mocked(getById).mockReturnValue(FIXTURE_ENG as any);
      const res = await GET(makeReq(), makeParams("1", "markdown"));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe(
        "text/markdown; charset=utf-8",
      );
      expect(await res.text()).toBe("# md body");
    });

    it("returns 200 + application/json for format=json", async () => {
      vi.mocked(getById).mockReturnValue(FIXTURE_ENG as any);
      const res = await GET(makeReq(), makeParams("1", "json"));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe(
        "application/json; charset=utf-8",
      );
      expect(await res.text()).toBe("{}");
    });

    it("returns 200 + text/html for format=html", async () => {
      vi.mocked(getById).mockReturnValue(FIXTURE_ENG as any);
      const res = await GET(makeReq(), makeParams("1", "html"));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe(
        "text/html; charset=utf-8",
      );
      expect(await res.text()).toBe("<!DOCTYPE html>");
    });

    it("sets Cache-Control: no-store", async () => {
      vi.mocked(getById).mockReturnValue(FIXTURE_ENG as any);
      const res = await GET(makeReq(), makeParams("1", "markdown"));
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });
  });

  describe("Content-Disposition (RFC 6266, EXPORT-05)", () => {
    it("has filename= BEFORE filename*=", async () => {
      vi.mocked(getById).mockReturnValue(FIXTURE_ENG as any);
      const res = await GET(makeReq(), makeParams("1", "markdown"));
      const cd = res.headers.get("Content-Disposition")!;
      expect(cd).toMatch(/^attachment; filename="[^"]+"; filename\*=UTF-8''/);
      // Explicit ordering assertion (filename index < filename* index).
      expect(cd.indexOf("filename=")).toBeLessThan(cd.indexOf("filename*="));
    });

    it("filename follows <ip>-YYYY-MM-DD.<ext> pattern", async () => {
      vi.mocked(getById).mockReturnValue(FIXTURE_ENG as any);
      const res = await GET(makeReq(), makeParams("1", "json"));
      const cd = res.headers.get("Content-Disposition")!;
      expect(cd).toMatch(/filename="10\.10\.10\.5-\d{4}-\d{2}-\d{2}\.json"/);
    });

    it("filename*= suffix is URL-encoded and matches the same name", async () => {
      vi.mocked(getById).mockReturnValue(FIXTURE_ENG as any);
      const res = await GET(makeReq(), makeParams("1", "html"));
      const cd = res.headers.get("Content-Disposition")!;
      // encodeURIComponent leaves `.` and `-` alone, so the IP + date + ext
      // chunk appears literal after `UTF-8''`.
      expect(cd).toMatch(/filename\*=UTF-8''10\.10\.10\.5-\d{4}-\d{2}-\d{2}\.html$/);
    });

    it("markdown uses .md extension (not .markdown)", async () => {
      vi.mocked(getById).mockReturnValue(FIXTURE_ENG as any);
      const res = await GET(makeReq(), makeParams("1", "markdown"));
      const cd = res.headers.get("Content-Disposition")!;
      expect(cd).toMatch(/\.md"/);
      expect(cd).not.toMatch(/\.markdown"/);
    });
  });

  describe("Dispatch exhaustiveness (covers Task 2 client contract)", () => {
    // Closes the Warning 1 gap: asserts the route dispatches EXACTLY the
    // correct generator for each valid format and NO generator for an invalid
    // one — the contract the client dropdown relies on.
    it("markdown format calls ONLY generateMarkdown", async () => {
      vi.mocked(getById).mockReturnValue(FIXTURE_ENG as any);
      await GET(makeReq(), makeParams("1", "markdown"));
      expect(vi.mocked(generateMarkdown)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(generateJson)).not.toHaveBeenCalled();
      expect(vi.mocked(generateHtml)).not.toHaveBeenCalled();
    });

    it("json format calls ONLY generateJson", async () => {
      vi.mocked(getById).mockReturnValue(FIXTURE_ENG as any);
      await GET(makeReq(), makeParams("1", "json"));
      expect(vi.mocked(generateJson)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(generateMarkdown)).not.toHaveBeenCalled();
      expect(vi.mocked(generateHtml)).not.toHaveBeenCalled();
    });

    it("html format calls ONLY generateHtml", async () => {
      vi.mocked(getById).mockReturnValue(FIXTURE_ENG as any);
      await GET(makeReq(), makeParams("1", "html"));
      expect(vi.mocked(generateHtml)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(generateMarkdown)).not.toHaveBeenCalled();
      expect(vi.mocked(generateJson)).not.toHaveBeenCalled();
    });

    it("invalid format calls NO generator", async () => {
      vi.mocked(getById).mockReturnValue(FIXTURE_ENG as any);
      await GET(makeReq(), makeParams("1", "pdf"));
      expect(vi.mocked(generateMarkdown)).not.toHaveBeenCalled();
      expect(vi.mocked(generateJson)).not.toHaveBeenCalled();
      expect(vi.mocked(generateHtml)).not.toHaveBeenCalled();
    });
  });

  describe("Error paths", () => {
    it("returns 400 for non-integer id", async () => {
      const res = await GET(makeReq(), makeParams("abc", "markdown"));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid engagement id");
    });

    it("returns 400 for zero / negative id", async () => {
      const res = await GET(makeReq(), makeParams("0", "markdown"));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid engagement id");
    });

    it("returns 400 for unknown format", async () => {
      vi.mocked(getById).mockReturnValue(FIXTURE_ENG as any);
      const res = await GET(makeReq(), makeParams("1", "pdf"));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Unknown format");
    });

    it("returns 404 for missing engagement", async () => {
      vi.mocked(getById).mockReturnValue(null as any);
      const res = await GET(makeReq(), makeParams("99999", "markdown"));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Engagement not found");
    });

    it("returns 500 with generic message when generator throws (no stack leak)", async () => {
      vi.mocked(getById).mockReturnValue(FIXTURE_ENG as any);
      vi.mocked(generateMarkdown).mockImplementationOnce(() => {
        throw new Error("boom: internal stack details should NOT leak");
      });
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await GET(makeReq(), makeParams("1", "markdown"));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Export failed");
      // No stack trace in client-visible body.
      expect(JSON.stringify(body)).not.toContain("boom");
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("returns 500 when target_ip fails the allowlist regex", async () => {
      vi.mocked(getById).mockReturnValue({
        ...FIXTURE_ENG,
        target_ip: "../etc/passwd",
      } as any);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await GET(makeReq(), makeParams("1", "markdown"));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Export failed");
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
