import { isAllowedUrl } from "@/lib/security/validate-url";

interface ResourceLinkProps {
  href: string;
  label: string;
}

export function ResourceLink({ href, label }: ResourceLinkProps) {
  if (!isAllowedUrl(href)) {
    return (
      <span className="text-xs text-muted-foreground">
        {label} (invalid link)
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-blue-400 underline underline-offset-2 hover:text-blue-300"
    >
      {label}
    </a>
  );
}
