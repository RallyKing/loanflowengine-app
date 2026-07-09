"use client";

import { cn } from "@/lib/cn";
import type { Id } from "@/convex/_generated/dataModel";

export type ClientContactPreviewItem = {
  contactId: Id<"contacts">;
  name: string;
  isPrimary?: boolean;
};

export type ClientContactPreviewProps = {
  contacts: ClientContactPreviewItem[];
  /** Max overlapping avatars before +N overflow. */
  maxVisible?: number;
  className?: string;
  /** When set, avatars and names open the contact profile for that id. */
  onContactClick?: (contactId: Id<"contacts">) => void;
};

const AVATAR_PALETTE = [
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
] as const;

const avatarButtonClass =
  "cursor-pointer transition-shadow duration-dlc-short ease-dlc-standard hover:ring-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function contactInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function avatarColorClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]!;
}

/**
 * Compact primary + additional contact preview for the client workspace header row.
 */
export function ClientContactPreview({
  contacts,
  maxVisible = 4,
  className,
  onContactClick,
}: ClientContactPreviewProps) {
  if (contacts.length === 0) return null;

  const visible = contacts.slice(0, maxVisible);
  const overflow = contacts.length - visible.length;
  const secondaryContacts = contacts.filter((row) => !row.isPrimary);
  const interactive = Boolean(onContactClick);

  const handleContactClick = (contactId: Id<"contacts">) => {
    onContactClick?.(contactId);
  };

  return (
    <div
      className={cn("flex min-w-0 items-center gap-1.5", className)}
      data-testid="pipeline-client-contact-preview"
    >
      <div
        className="flex shrink-0 items-center"
        aria-label={`${contacts.length} associated contact${contacts.length === 1 ? "" : "s"}`}
      >
        {visible.map((contact, index) => {
          const avatarClass = cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-background",
            avatarColorClass(contact.name),
            index > 0 && "-ml-2",
            interactive && avatarButtonClass,
          );

          if (interactive) {
            return (
              <button
                key={String(contact.contactId)}
                type="button"
                className={avatarClass}
                title={`View ${contact.name}`}
                aria-label={`View ${contact.name}`}
                data-testid={`pipeline-client-contact-avatar-${String(contact.contactId)}`}
                onClick={() => handleContactClick(contact.contactId)}
              >
                {contactInitials(contact.name)}
              </button>
            );
          }

          return (
            <span
              key={String(contact.contactId)}
              className={avatarClass}
              title={contact.name}
            >
              {contactInitials(contact.name)}
            </span>
          );
        })}
        {overflow > 0 ? (
          <span
            className="-ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background"
            title={`${overflow} more contact${overflow === 1 ? "" : "s"}`}
          >
            +{overflow}
          </span>
        ) : null}
      </div>

      {secondaryContacts.length > 0 ? (
        <span
          className="hidden min-w-0 truncate text-xs text-muted-foreground sm:inline"
          data-testid="pipeline-client-contact-preview-names"
        >
          {secondaryContacts.map((contact, index) =>
            interactive ? (
              <span key={String(contact.contactId)}>
                {index > 0 ? ", " : null}
                <button
                  type="button"
                  className="cursor-pointer underline-offset-2 transition-colors duration-dlc-short ease-dlc-standard hover:text-foreground hover:underline"
                  title={`View ${contact.name}`}
                  data-testid={`pipeline-client-contact-name-${String(contact.contactId)}`}
                  onClick={() => handleContactClick(contact.contactId)}
                >
                  {contact.name}
                </button>
              </span>
            ) : (
              <span key={String(contact.contactId)}>
                {index > 0 ? ", " : null}
                {contact.name}
              </span>
            ),
          )}
        </span>
      ) : null}
    </div>
  );
}
