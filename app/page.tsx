/**
 * Landing page — RSC shell with centered PastePanel + ImportPanel.
 *
 * PastePanel handles the primary paste interaction (nmap text/XML). ImportPanel
 * provides the secondary AutoRecon zip upload path. Both client islands live
 * in the same centered column, separated by an "or" divider.
 *
 * Per D-01 (Phase 4): Minimal landing — centered textarea + "Start Engagement" button.
 * Per D-01 (Phase 5): AutoRecon zip drop zone placed BELOW PastePanel with "or" divider.
 * Per D-05: Sidebar is visible alongside (rendered by layout).
 */

import { PastePanel } from "@/components/PastePanel";
import { ImportPanel } from "@/components/ImportPanel";
import { Separator } from "@/components/ui/separator";

export default function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full">
        <PastePanel />

        {/* "or" divider between paste and import (D-01, Phase 5) */}
        <div className="relative mx-auto my-6 w-full max-w-[680px] px-8">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs text-muted-foreground">
            or
          </span>
        </div>

        {/* AutoRecon zip import (D-01, Phase 5) */}
        <div className="mx-auto w-full max-w-[680px] px-8">
          <ImportPanel />
        </div>
      </div>
    </div>
  );
}
