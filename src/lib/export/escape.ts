/**
 * HTML escape helper for string-concatenated HTML export.
 *
 * Unlike React components (which auto-escape children), template-string
 * concatenation does NOT auto-escape. Every dynamic value (NSE output, notes,
 * service names, hostnames, etc.) MUST pass through escapeHtml() before
 * insertion into the HTML template produced by src/lib/export/html.ts.
 *
 * Phase 6, RESEARCH.md Security Domain, Plan 06-05 Task 1.
 *
 * NO `import "server-only"` here — this helper is pure, zero-dependency, and
 * usable from any context (server, client, test). Leaf utility.
 *
 * Character coverage (OWASP-minimum set for HTML-body contexts):
 *   & → &amp;   — MUST be first, otherwise subsequent entity replacements
 *                 produce double-encoded output (`&lt;` input would survive
 *                 unescaped if ampersand replacement ran after `<`).
 *   < → &lt;
 *   > → &gt;
 *   " → &quot;  — required for safe use inside double-quoted attribute values
 *   ' → &#x27;  — required for safe use inside single-quoted attribute values;
 *                 the numeric form is used instead of the named entity `&apos;`
 *                 because `&apos;` is not part of HTML 4 / legacy user agents.
 *
 * This covers both element-body and attribute-value contexts. It does NOT
 * cover JavaScript string contexts or URI contexts — those would need
 * context-specific encoders, but the HTML export NEVER emits `<script>` or
 * interpolates dynamic values into URIs (D-15 hard constraint).
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
