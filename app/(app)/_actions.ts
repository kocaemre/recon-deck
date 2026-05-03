"use server";

/**
 * Layout-level server actions — mutations that aren't scoped to a single
 * page (engagement, settings tab) but live on the (app) shell itself.
 *
 * Sidebar collapse state is the only one for now; future shell-level
 * preferences (theme, density) would land here too.
 */

import { revalidatePath } from "next/cache";
import { db, setAppState } from "@/lib/db";

export async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
  if (typeof collapsed !== "boolean") {
    throw new Error("Invalid value.");
  }
  setAppState(db, { sidebar_collapsed: collapsed });
  revalidatePath("/", "layout");
}
