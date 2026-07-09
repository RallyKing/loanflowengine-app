import type { Id } from "@/convex/_generated/dataModel";

/** Hub-first root crumb: individual contact hub or entity hub for workspace clients. */
export function contactHubHrefForClient(args: {
  clientId: Id<"clients">;
  primaryContactId?: Id<"contacts"> | null;
}): string {
  if (args.primaryContactId) {
    return `/contacts/${args.primaryContactId}`;
  }
  return `/contacts/entity/${args.clientId}`;
}

export function contactHubBackLabel(displayName: string): string {
  const label = displayName.trim();
  return label || "Contact hub";
}
