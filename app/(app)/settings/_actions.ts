"use server";

/**
 * Settings server actions — v1.9.0 onboarding toggles.
 *
 * Two mutations, both scoped to the app_state singleton:
 *   replayOnboardingAction   — clears onboarded_at so /welcome remounts on next nav
 *   setUpdateCheckAction     — flips the GitHub release-check opt-in
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, replayOnboarding, setAppState } from "@/lib/db";
import type { ThemeMode, AppStatePatch } from "@/lib/db/app-state-repo";
import { isAiProvider } from "@/lib/ai/providers";

export async function replayOnboardingAction(): Promise<void> {
  replayOnboarding(db);
  revalidatePath("/", "layout");
  redirect("/welcome");
}

export async function setUpdateCheckAction(enabled: boolean): Promise<void> {
  if (typeof enabled !== "boolean") {
    throw new Error("Invalid value.");
  }
  setAppState(db, { update_check: enabled });
  revalidatePath("/settings");
}

export async function setThemeAction(theme: ThemeMode): Promise<void> {
  if (theme !== "system" && theme !== "dark" && theme !== "light") {
    throw new Error("Invalid theme.");
  }
  setAppState(db, { theme });
  // Layout-wide because the html className is set in the root layout.
  revalidatePath("/", "layout");
}

/**
 * Exam Mode — hard override that forces the AI assistant off (OSCP-style
 * exams forbid AI). Layout-wide revalidate so the badge appears/disappears
 * everywhere immediately.
 */
export async function setExamModeAction(enabled: boolean): Promise<void> {
  if (typeof enabled !== "boolean") throw new Error("Invalid value.");
  setAppState(db, { exam_mode: enabled });
  revalidatePath("/", "layout");
}

export interface AiSettingsInput {
  enabled: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  /**
   * undefined / "" → leave the stored key untouched (so saving other fields
   * doesn't require re-typing it); a non-empty string → set it; null → clear.
   */
  apiKey?: string | null;
}

/**
 * Persist the AI co-pilot config. The key is write-only from the client's
 * perspective — it's never read back, and an empty submission keeps the
 * existing one. Base URL / model empty → null so the provider preset default
 * applies (resolved server-side in `effectiveAiConfig`).
 */
export async function setAiSettingsAction(
  input: AiSettingsInput,
): Promise<void> {
  if (typeof input?.enabled !== "boolean") throw new Error("Invalid value.");
  if (!isAiProvider(input.provider)) throw new Error("Invalid provider.");

  const baseUrl = (input.baseUrl ?? "").trim();
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    throw new Error("Base URL must start with http:// or https://");
  }
  const model = (input.model ?? "").trim();

  const patch: AppStatePatch = {
    ai_enabled: input.enabled,
    ai_provider: input.provider,
    ai_base_url: baseUrl || null,
    ai_model: model || null,
  };
  if (input.apiKey === null) {
    patch.ai_api_key = null; // explicit clear
  } else if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    patch.ai_api_key = input.apiKey.trim();
  }
  // undefined / blank → omit, leaving the stored key as-is.

  setAppState(db, patch);
  revalidatePath("/", "layout");
}
