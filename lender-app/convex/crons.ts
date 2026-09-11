import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { DURABLE_JOB_BACKUP_SWEEP_MINUTES } from "../lib/convexCronIntervals";

const crons = cronJobs();

crons.daily(
  "task deadline notifications",
  { hourUTC: 14, minuteUTC: 0 },
  internal.notifications.deadlineDigest,
  {},
);

crons.interval(
  "integration durable jobs sweep",
  { minutes: DURABLE_JOB_BACKUP_SWEEP_MINUTES },
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
  { minutes: DURABLE_JOB_BACKUP_SWEEP_MINUTES },
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
  { minutes: DURABLE_JOB_BACKUP_SWEEP_MINUTES },
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
  { minutes: 15 },
  internal.presence.purgeExpired,
  {},
);

// Auto-archive is manual only (`pipelineAutoArchiveSweep.runDueAutoArchives`).
// Do not re-add a cron — chained empty ticks burned ~1.3M function calls.

crons.daily(
  "full data backup snapshot",
  { hourUTC: 4, minuteUTC: 15 },
  internal.dataBackup.runScheduledBackup,
  {},
);

export default crons;
