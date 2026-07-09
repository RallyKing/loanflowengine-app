/**
 * Plans outbound channel fan-out from collaboration / notification events.
 * Does not perform network I/O — returns routing intents for workers / Convex actions.
 */
import type { CommsChannel, CommsMessage, CommsPriority } from "./providers/types";
import type { NotificationCategory } from "@/lib/notificationPreferences";

export type ChannelRouteIntent = {
  channel: CommsChannel;
  priority: CommsPriority;
  /** Dedupe at enqueue layer. */
  idempotencyKey: string;
};

export type CollaborationRouteInput = {
  organizationId: string;
  category: NotificationCategory;
  targetUserKey: string;
  summary: string;
  detail?: string;
};

function priorityForCategory(category: NotificationCategory): CommsPriority {
  switch (category) {
    case "deadline":
    case "assignment_change":
    case "task_assignment":
      return "high";
    case "mention":
    case "comment_activity":
      return "normal";
    case "digest_group":
      return "low";
    default:
      return "normal";
  }
}

/**
 * Maps a notification to zero or more outbound channels (email/sms/etc.).
 * Phase 8: in-app is handled separately via Convex; this prepares multi-channel.
 */
export function planOutboundRoutes(_input: CollaborationRouteInput): ChannelRouteIntent[] {
  void _input;
  return [];
}

export function buildCommsMessageStub(input: {
  organizationId: string;
  channel: CommsChannel;
  targetRef: string;
  bodyText: string;
  subject?: string;
  category: NotificationCategory;
}): CommsMessage {
  return {
    idempotencyKey: `${input.organizationId}:${input.channel}:${input.category}:${Date.now()}`,
    organizationId: input.organizationId,
    channel: input.channel,
    priority: priorityForCategory(input.category),
    targetRef: input.targetRef,
    subject: input.subject,
    bodyText: input.bodyText,
  };
}
