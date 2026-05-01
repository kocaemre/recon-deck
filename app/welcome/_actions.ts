"use server";

/**
 * /welcome server actions (v1.9.0).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { db, markOnboarded } from "@/lib/db";
import { revalidatePath } from "next/cache";

export interface OnboardingPayload {
  localExportDir: string;
  kbUserDir: string;
  wordlistBase: string;
  updateCheck: boolean;
}

interface ActionResult {
  ok: boolean;
  error?: string;
}

const MAX_PATH_LEN = 1024;

function sanitize(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_PATH_LEN) {
    throw new Error(`Path too long (max ${MAX_PATH_LEN} chars).`);
  }
  return trimmed;
}

/**
 * Path validation backing the on-blur ✓/✗ chip on Step 3. Only checks
 * `R_OK` so a read-only mount (or an SecLists symlinked from another
 * volume) still passes. Empty input → `empty`.
 */
export async function validatePath(
  raw: string,
): Promise<"ok" | "miss" | "empty"> {
  const value = raw.trim();
  if (value.length === 0) return "empty";
  if (value.length > MAX_PATH_LEN) return "miss";
  // Reject anything that's clearly not a filesystem path so the chip
  // doesn't lie about a URL or env-var-style placeholder.
  if (!path.isAbsolute(value)) return "miss";
  try {
    await fs.access(value, fs.constants.R_OK);
    return "ok";
  } catch {
    return "miss";
  }
}

async function persist(
  payload: OnboardingPayload,
): Promise<ActionResult> {
  try {
    const localExportDir = sanitize(payload.localExportDir);
    const kbUserDir = sanitize(payload.kbUserDir);
    const wordlistBase = sanitize(payload.wordlistBase);

    markOnboarded(db, {
      local_export_dir: localExportDir,
      kb_user_dir: kbUserDir,
      wordlist_base: wordlistBase,
      update_check: !!payload.updateCheck,
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("completeOnboarding failed:", err);
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Could not write app_state.",
    };
  }
}

/**
 * Final submit on Step 4. Persists every form field + flips
 * onboarded_at. The client redirects after a successful response.
 */
export async function completeOnboarding(
  payload: OnboardingPayload,
): Promise<ActionResult> {
  return persist(payload);
}

/**
 * Skip exit (Steps 1, 2, 4 — and Step 3 after the SkipDialog confirm).
 * Same effect as complete; we still stamp onboarded_at so the operator
 * doesn't bounce back to /welcome on next render. The form values are
 * whatever they had when they hit Skip — empties land as nulls.
 */
export async function skipOnboarding(
  payload: OnboardingPayload,
): Promise<ActionResult> {
  return persist(payload);
}
