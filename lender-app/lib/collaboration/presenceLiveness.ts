/**
 * Presence liveness is evaluated on the client.
 *
 * `presence.listActiveInOrganization` returns heartbeat rows without comparing
 * `expiresAt` to the clock, because a wall-clock read inside a Convex query makes
 * the result uncacheable and forces every subscriber to re-execute it. The rows
 * carry `expiresAt`, so callers drop stale members here instead.
 *
 * No timer is needed to keep this fresh: every member's heartbeat writes to
 * `memberPresence` about once a minute, which invalidates the subscription and
 * re-renders consumers with a new evaluation instant.
 */

export type PresenceLivenessRow = { expiresAt: number };

export function isPresenceRowLive(
  row: PresenceLivenessRow,
  now: number = Date.now(),
): boolean {
  return Number.isFinite(row.expiresAt) && row.expiresAt > now;
}

export function filterLivePresenceRows<T extends PresenceLivenessRow>(
  rows: readonly T[] | undefined,
  now: number = Date.now(),
): T[] {
  if (!rows?.length) return [];
  return rows.filter((row) => isPresenceRowLive(row, now));
}
