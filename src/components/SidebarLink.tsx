"use client";

/**
 * SidebarLink — client component for sidebar engagement items.
 *
 * Handles two client-only concerns:
 * 1. Active-state highlighting via `usePathname()` (needs client JS)
 * 2. Date-on-hover tooltip via shadcn Tooltip (needs interactivity)
 *
 * Per D-11: "Date shown on hover as tooltip."
 * Per UI-SPEC PERSIST-03: Active engagement has 2px left border in --primary green.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarLinkProps {
  href: string;
  /** ISO-8601 created_at timestamp for the tooltip */
  createdAt: string;
  children: React.ReactNode;
}

export function SidebarLink({ href, createdAt, children }: SidebarLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  // Format the date for human-readable tooltip
  const formattedDate = new Date(createdAt).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href}
            className={cn(
              "block rounded-md px-3 py-2 transition-colors hover:bg-muted",
              isActive && "border-l-2 border-primary bg-muted",
            )}
          >
            {children}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          Created {formattedDate}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
