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
import type { ThemeMode } from "@/lib/db/app-state-repo";

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
