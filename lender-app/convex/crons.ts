import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "task deadline notifications",
  { hourUTC: 14, minuteUTC: 0 },
  internal.notifications.deadlineDigest,
  {},
);

crons.interval(
  "integration durable jobs sweep",
  { minutes: 1 },
  internal.integrationJobs.sweepDueJobs,
  {},
);

crons.interval(
  "integration stale running recovery",
  { minutes: 15 },
  internal.integrationJobs.recoverStaleRunningJobs,
  {},
);

crons.interval(
  "communications due sweep",
  { minutes: 1 },
  internal.communications.sweepDueOutboundMessages,
  {},
);

crons.interval(
  "communications stale sending recovery",
  { minutes: 15 },
  internal.communications.recoverStaleSendingMessages,
  {},
);

crons.interval(
  "outbound webhook deliveries sweep",
  { minutes: 1 },
  internal.webhookOutbound.sweepOutboundWebhookDeliveries,
  {},
);

crons.interval(
  "outbound webhook stale running recovery",
  { minutes: 15 },
  internal.webhookOutbound.recoverStaleOutboundDeliveries,
  {},
);

crons.interval(
  "portal auth anomaly scan",
  { minutes: 15 },
  internal.securityScan.scanPortalAuthAnomalies,
  {},
);

crons.interval(
  "collaboration presence purge",
  { minutes: 5 },
  internal.presence.purgeExpired,
  {},
);

crons.daily(
  "full data backup snapshot",
  { hourUTC: 4, minuteUTC: 15 },
  internal.dataBackup.runScheduledBackup,
  {},
);

export default crons;
