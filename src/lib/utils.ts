import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combine conditional class names and merge Tailwind conflicts.
 * Canonical shadcn/ui helper — every component in `src/components/ui/` uses this.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
