/**
 * Collaboration notification orchestration — pure routing helpers.
 * Convex mutations call `dispatchUserNotification` directly; this module
 * centralizes category mapping and outbound intent planning for workers.
 */
import type { NotificationCategory } from "@/lib/notificationPreferences";
import {
  planOutboundRoutes,
  buildCommsMessageStub,
} from "@/lib/comms/channelRouter";

export function collaborationCategoryForEvent(
  kind: "assignment" | "comment" | "document" | "status" | "digest",
): NotificationCategory {
  switch (kind) {
    case "assignment":
      return "assignment_change";
    case "comment":
      return "comment_activity";
    case "document":
      return "document_activity";
    case "status":
      return "status_change";
    case "digest":
      return "digest_group";
  }
}

export { planOutboundRoutes, buildCommsMessageStub };
