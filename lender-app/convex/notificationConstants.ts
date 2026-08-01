import { v } from "convex/values";



/** Canonical SaaS notification events routed to external webhook endpoints. */

export const NOTIFICATION_EVENT_TYPES = [

  "test_ping",

  "client_document_uploaded",

  "lender_portal_accessed",

  "task_status_changed",

  "deal_package_compiled",

] as const;



export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];



const EVENT_SET = new Set<string>(NOTIFICATION_EVENT_TYPES);



export const MAX_WEBHOOK_DELIVERY_ATTEMPTS = 3;



/** Retry delays before attempts 2 and 3 (ms). */

export const WEBHOOK_RETRY_DELAYS_MS: readonly [number, number] = [

  5 * 60 * 1000,

  15 * 60 * 1000,

];



export const notificationEventV = v.union(

  v.literal("test_ping"),

  v.literal("client_document_uploaded"),

  v.literal("lender_portal_accessed"),

  v.literal("task_status_changed"),

  v.literal("deal_package_compiled"),

);



export function isNotificationEventType(raw: string): raw is NotificationEventType {

  return EVENT_SET.has(raw);

}



export function sanitizeSubscribedEvents(raw: readonly string[]): NotificationEventType[] {

  const out: NotificationEventType[] = [];

  const seen = new Set<string>();

  for (const item of raw) {

    const t = item.trim();

    if (!isNotificationEventType(t) || seen.has(t)) continue;

    seen.add(t);

    out.push(t);

  }

  return out;

}



export function notificationEventLabel(event: NotificationEventType): string {

  switch (event) {

    case "test_ping":

      return "Test ping";

    case "client_document_uploaded":

      return "Client document uploaded";

    case "lender_portal_accessed":

      return "Lender portal accessed";

    case "task_status_changed":

      return "Task status changed";

    case "deal_package_compiled":

      return "Deal package compiled";

    default:

      return event;

  }

}


