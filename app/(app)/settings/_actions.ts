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
