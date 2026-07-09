import type { Id } from "@/convex/_generated/dataModel";

export function contactHubHref(contactId: Id<"contacts">): string {
  return `/contacts/${contactId}`;
}

export function entityHubHref(entityId: Id<"clients">): string {
  return `/contacts/entity/${entityId}`;
}
