/**
 * Sidebar — RSC component rendering the engagement list.
 *
 * Receives engagements as a prop from the root layout (which queries
 * listSummaries from the database). No "use client" directive — this is a
 * server component.
 *
 * Per D-10: Fixed left sidebar, always visible. "New Engagement" button at top.
 * Per D-11: Each item shows name, IP, port count. Date on hover via SidebarLink.
 * Per D-05: Sidebar shows empty state ("No engagements yet") when list is empty.
 * Per UI-SPEC: Sidebar width 280px, engagement items sorted by created_at desc.
 */

import { Button } from "@/components/ui/button";
import { SidebarLink } from "@/components/SidebarLink";
import Link from "next/link";
import type { EngagementSummary } from "@/lib/db/types";

interface SidebarProps {
  engagements: EngagementSummary[];
}

export function Sidebar({ engagements }: SidebarProps) {
  return (
    <aside className="flex h-screen w-[280px] shrink-0 flex-col border-r border-border bg-card">
      {/* New Engagement button at top -- D-10 */}
      <div className="p-4">
        <Button variant="outline" className="w-full" asChild>
          <Link href="/">New Engagement</Link>
        </Button>
      </div>

      {/* Engagement list -- PERSIST-03, D-11 */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {engagements.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-sm font-semibold text-foreground">
              No engagements yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Paste nmap output to create your first engagement.
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {engagements.map((eng) => (
              <li key={eng.id}>
                <SidebarLink
                  href={`/engagements/${eng.id}`}
                  createdAt={eng.created_at}
                >
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {eng.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {eng.target_ip}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {eng.port_count} {eng.port_count === 1 ? "port" : "ports"}
                  </span>
                </SidebarLink>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
