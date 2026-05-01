import { redirect } from "next/navigation";
import { db, effectiveAppState } from "@/lib/db";

/**
 * /welcome layout — full-screen, no sidebar (v1.9.0).
 *
 * Reverse guard: if the operator is already onboarded and they hit
 * /welcome by URL surgery, bounce back to /. Replay flow clears
 * onboarded_at via the action under /settings, so legitimate replays
 * pass this gate.
 */

export const dynamic = "force-dynamic";

export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cfg = effectiveAppState(db);
  if (cfg.onboardedAt) redirect("/");
  return <main className="flex-1 overflow-y-auto">{children}</main>;
}
