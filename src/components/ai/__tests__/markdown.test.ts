import { describe, expect, it } from "vitest";
import { parseBlocks } from "../markdown-parse";

/**
 * Markdown block parser (beta-test follow-up): AI panels showed literal `**`
 * and `###` because output was printed raw. These cover the structural parse;
 * inline bold/code/italic rendering is React and verified in the UI.
 */
describe("ai Markdown parseBlocks", () => {
  it("parses headings with level", () => {
    expect(parseBlocks("### Plan")).toEqual([{ type: "h", level: 3, text: "Plan" }]);
  });

  it("groups consecutive numbered items into one ordered list (start 1)", () => {
    const b = parseBlocks("1. first\n2. second\n3. third");
    expect(b).toHaveLength(1);
    expect(b[0].type).toBe("ol");
    expect(b[0].items).toEqual(["first", "second", "third"]);
    expect(b[0].start).toBe(1);
  });

  it("ordered list split by prose keeps the source numbers (no 1. 1. 1.)", () => {
    // The cross-host summary interleaves a "Reason:" line between numbered steps.
    const b = parseBlocks(
      "1. Host A — do this\nReason: because\n2. Host B — do that\nReason: because\n3. Host C — and this",
    );
    const ols = b.filter((x) => x.type === "ol");
    expect(ols.map((o) => o.start)).toEqual([1, 2, 3]);
    expect(ols.map((o) => o.items![0])).toEqual([
      "Host A — do this",
      "Host B — do that",
      "Host C — and this",
    ]);
  });

  it("honors an explicit start offset for a contiguous list", () => {
    expect(parseBlocks("5. five\n6. six")[0].start).toBe(5);
  });

  it("groups bullet items into one unordered list", () => {
    const b = parseBlocks("- a\n- b");
    expect(b[0].type).toBe("ul");
    expect(b[0].items).toEqual(["a", "b"]);
  });

  it("splits paragraphs on blank lines and keeps list separate", () => {
    const b = parseBlocks("intro line\n\n- item one\n- item two");
    expect(b.map((x) => x.type)).toEqual(["p", "ul"]);
    expect(b[0].text).toBe("intro line");
  });

  it("treats '1)' style as ordered too", () => {
    expect(parseBlocks("1) step")[0].type).toBe("ol");
  });
});
