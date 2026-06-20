/**
 * Pure Markdown block parser for the AI panels (no JSX, so it's unit-testable).
 * Rendering of blocks + inline spans lives in Markdown.tsx.
 */

export interface MdBlock {
  type: "h" | "ul" | "ol" | "p";
  level?: number;
  items?: string[]; // for lists
  text?: string; // for h / p
}

/** Group lines into headings / lists / paragraphs. */
export function parseBlocks(src: string): MdBlock[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: "p", text: para.join(" ") });
      para = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) {
      flushPara();
      blocks.push({ type: "h", level: h[1].length, text: h[2] });
    } else if (ul) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last?.type === "ul") last.items!.push(ul[1]);
      else blocks.push({ type: "ul", items: [ul[1]] });
    } else if (ol) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last?.type === "ol") last.items!.push(ol[1]);
      else blocks.push({ type: "ol", items: [ol[1]] });
    } else if (!line.trim()) {
      flushPara();
    } else {
      para.push(line.trim());
    }
  }
  flushPara();
  return blocks;
}
