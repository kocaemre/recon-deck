/**
 * URL scheme validation (SEC-04).
 *
 * Pure function — testable without React. Used by any component that
 * renders an <a href> from KB or user-supplied data (e.g. ResourceLink).
 *
 * Only https: and http: schemes pass. javascript:, data:, file:, ftp:,
 * and any other scheme are rejected. Malformed URLs (including relative
 * paths like "/foo") fail the URL constructor and are rejected.
 *
 * Defense in depth alongside the CSP `default-src 'self'` — CSP blocks
 * runtime navigation to disallowed schemes in modern browsers, and this
 * check blocks them before render.
 */

const ALLOWED_SCHEMES = new Set<string>(["https:", "http:"]);

/**
 * Validate that a URL uses an allowed scheme (https or http only).
 *
 * Returns true if the URL parses successfully and uses an allowed scheme.
 * Returns false for javascript:, data:, ftp:, relative paths, or any
 * malformed input.
 */
export function isAllowedUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return ALLOWED_SCHEMES.has(url.protocol);
  } catch {
    return false;
  }
}
