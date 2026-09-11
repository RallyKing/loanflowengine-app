/**
 * Unit checks for viewer timezone formatting / datetime-local round-trip.
 * Run: npx tsx scripts/date-time-zone-tests.ts
 */

import assert from "node:assert/strict";
import {
  DEFAULT_VIEWER_TIMEZONE,
  formatDateTimeInTimeZone,
  formatRemainingUntil,
  formatTimeZoneShortName,
  fromDatetimeLocalValueInTimeZone,
  mergeDisplaySettingsTimezone,
  resolveViewerTimeZone,
  toDatetimeLocalValueInTimeZone,
  zonedWallTimeToUtcMs,
} from "../lib/dateTimeZone";

function main() {
  assert.equal(DEFAULT_VIEWER_TIMEZONE, "America/Chicago");
  assert.equal(resolveViewerTimeZone(null), "America/Chicago");
  assert.equal(resolveViewerTimeZone({}), "America/Chicago");
  assert.equal(
    resolveViewerTimeZone({ timezone: "America/New_York" }),
    "America/New_York",
  );
  assert.equal(
    resolveViewerTimeZone({ timezone: "Not/AZone" }),
    "America/Chicago",
  );

  const merged = mergeDisplaySettingsTimezone(
    { blockColor: "#112233", timezone: "UTC" },
    "America/Los_Angeles",
  );
  assert.equal(merged.timezone, "America/Los_Angeles");
  assert.equal(merged.blockColor, "#112233");

  const cleared = mergeDisplaySettingsTimezone(merged, null);
  assert.equal("timezone" in cleared, false);
  assert.equal(cleared.blockColor, "#112233");

  // 2026-08-05 19:00:00 CDT = 2026-08-06 00:00:00 UTC
  const utcMs = zonedWallTimeToUtcMs(2026, 8, 5, 19, 0, 0, "America/Chicago");
  assert.equal(utcMs, Date.UTC(2026, 7, 6, 0, 0, 0));

  const localValue = toDatetimeLocalValueInTimeZone(utcMs, "America/Chicago");
  assert.equal(localValue, "2026-08-05T19:00");

  const roundTrip = fromDatetimeLocalValueInTimeZone(
    localValue,
    "America/Chicago",
  );
  assert.equal(roundTrip, utcMs);

  // Same wall clock interpreted in Eastern must differ from Central.
  const easternMs = fromDatetimeLocalValueInTimeZone(
    "2026-08-05T19:00",
    "America/New_York",
  );
  assert.ok(easternMs != null);
  assert.notEqual(easternMs, utcMs);

  const labeled = formatDateTimeInTimeZone(utcMs, "America/Chicago", {
    includeSeconds: false,
    includeTimeZoneName: true,
  });
  assert.match(labeled, /2026/);
  assert.match(labeled, /8\/5\/2026|Aug/);
  assert.match(labeled, /7:00/);
  const short = formatTimeZoneShortName(utcMs, "America/Chicago");
  assert.match(short, /C[DS]T|GMT-5|GMT-6/i);
  assert.ok(labeled.includes(short) || /C[DS]T/.test(labeled));

  // Remaining days: ~90d from Aug 5 → Nov 3-ish.
  const now = Date.UTC(2026, 7, 5, 12, 0, 0); // Aug 5 noon UTC
  const expires = now + 89 * 86_400_000;
  assert.equal(formatRemainingUntil(expires, now), "89d remaining");
  assert.equal(formatRemainingUntil(now - 1, now), "Expired");
  assert.equal(
    formatRemainingUntil(now + 3 * 60 * 60 * 1000, now),
    "3h remaining",
  );

  console.log("date-time-zone-tests: ok");
}

main();
