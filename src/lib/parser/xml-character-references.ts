/** Decode XML's five predefined references and valid XML 1.0 numeric references.
 * One pass only: replacement text is never rescanned, and output cannot grow.
 * Unknown names and invalid code points are retained verbatim.
 */
function decode(text: string): string {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  };
  return text.replace(/&(amp|lt|gt|quot|apos|#(?:[0-9]+|x[0-9a-fA-F]+));/g, (reference, body: string) => {
    if (body[0] !== "#") return named[body];
    const hex = body[1] === "x";
    const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    const valid = code === 0x9 || code === 0xa || code === 0xd ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff);
    return valid ? String.fromCodePoint(code) : reference;
  });
}

function rejectCustomEntities(entities: Record<string, string>): void {
  if (Object.keys(entities).length > 0) {
    throw new Error("Custom XML entities are not supported.");
  }
}

/** fast-xml-parser calls this only for attributes and ordinary text, not CDATA.
 * The stateless decoder never accepts DTD/external definitions or resolves URLs.
 */
export const xmlCharacterReferences = {
  decode,
  addInputEntities: rejectCustomEntities,
  setExternalEntities: rejectCustomEntities,
  reset() {},
  setXmlVersion() {},
};
