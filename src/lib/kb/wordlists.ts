/**
 * Wordlist placeholder lookup (P1-E).
 *
 * Maps `{WORDLIST_*}` tokens in command templates to filesystem paths. The
 * shipped table targets a Kali Linux default install (SecLists at
 * `/usr/share/seclists`, dirb at `/usr/share/wordlists/dirb`, …). Operators
 * who installed wordlists somewhere else override individual keys via
 * `/settings/wordlists` — the override table lives in `wordlist_overrides`
 * (migration 0006) and is read by the engagement page + view-model.
 *
 * Pure helper — no I/O. Resolution order is "override wins":
 *   1. caller-supplied `overrides[key]` if non-empty
 *   2. shipped DEFAULT_WORDLISTS[key]
 *   3. fall through: leave the placeholder verbatim, so the user spots an
 *      unmapped key in their command rather than getting a silently empty
 *      path that runs against `/`.
 *
 * Why an explicit allowlist rather than free-form `{WORDLIST_*}`? KB lint
 * rejects unknown placeholders (`scripts/lint-kb.ts` PLACEHOLDER_ALLOWLIST)
 * — but the *general* WORDLIST_ pattern is allowed there because user
 * commands and AutoRecon-imported templates may reference custom keys.
 * This module's `DEFAULT_WORDLISTS` is the shipping default; users add
 * overrides for any key they want.
 */

/** Default Kali install paths for the shipped wordlist keys. */
export const DEFAULT_WORDLISTS: Record<string, string> = {
  // Directory & file content discovery
  WORDLIST_DIRB_COMMON: "/usr/share/wordlists/dirb/common.txt",
  WORDLIST_DIRB_BIG: "/usr/share/wordlists/dirb/big.txt",
  WORDLIST_RAFT_DIRS:
    "/usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt",
  WORDLIST_RAFT_DIRS_BIG:
    "/usr/share/seclists/Discovery/Web-Content/raft-large-directories.txt",
  WORDLIST_RAFT_FILES:
    "/usr/share/seclists/Discovery/Web-Content/raft-medium-files.txt",
  // Subdomain / vhost enumeration
  WORDLIST_SUBDOMAINS:
    "/usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt",
  WORDLIST_SUBDOMAINS_BIG:
    "/usr/share/seclists/Discovery/DNS/subdomains-top1million-110000.txt",
  // Credentials
  WORDLIST_USERS_TOP:
    "/usr/share/seclists/Usernames/top-usernames-shortlist.txt",
  WORDLIST_USERS_NAMES:
    "/usr/share/seclists/Usernames/Names/names.txt",
  WORDLIST_PASSWORDS_TOP:
    "/usr/share/seclists/Passwords/Common-Credentials/10-million-password-list-top-1000.txt",
  WORDLIST_ROCKYOU: "/usr/share/wordlists/rockyou.txt",
  // Fuzzing payload corpora
  WORDLIST_LFI:
    "/usr/share/seclists/Fuzzing/LFI/LFI-gracefulsecurity-linux.txt",
  WORDLIST_XSS:
    "/usr/share/seclists/Fuzzing/XSS/XSS-Jhaddix.txt",
  // SNMP community strings
  WORDLIST_SNMP_COMMUNITIES:
    "/usr/share/seclists/Discovery/SNMP/common-snmp-community-strings.txt",
};

/** Token shape: `{WORDLIST_AAA_BBB_123}`. Caps + digits + underscores. */
const WORDLIST_TOKEN_RE = /\{(WORDLIST_[A-Z0-9_]+)\}/g;

/**
 * Replace every `{WORDLIST_*}` token in `template` with its resolved path.
 *
 * @param overrides keyed by the WORDLIST_* identifier (no braces). An empty
 *   string or whitespace-only override is treated as "no override" — falls
 *   through to the shipped default. Pass an empty object / undefined to
 *   resolve against shipped defaults only.
 */
export function interpolateWordlists(
  template: string,
  overrides?: Record<string, string>,
): string {
  return template.replace(WORDLIST_TOKEN_RE, (match, key: string) => {
    const override = overrides?.[key];
    if (override && override.trim().length > 0) return override.trim();
    const shipped = DEFAULT_WORDLISTS[key];
    if (shipped) return shipped;
    // Unknown key — leave the token verbatim so the user notices the gap.
    return match;
  });
}

/** True iff `key` matches the WORDLIST_ identifier shape (no braces). */
export function isValidWordlistKey(key: string): boolean {
  return /^WORDLIST_[A-Z0-9_]+$/.test(key);
}
