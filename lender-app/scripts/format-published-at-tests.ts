/**
 * Unit checks for Product Updates publishedAt formatting (viewer-local).
 * Run: npx tsx scripts/format-published-at-tests.ts
 */

import assert from "node:assert/strict";
import {
  formatPublishedAt,
  isValidPublishedAt,
  normalizePublishedAt,
} from "../lib/product-knowledge/formatPublishedAt";

function main() {
  assert.equal(isValidPublishedAt(0), false);
  assert.equal(isValidPublishedAt(NaN), false);
  assert.equal(isValidPublishedAt(undefined), false);
  assert.equal(isValidPublishedAt(1_577_836_799_999), false);
  assert.equal(isValidPublishedAt(1_785_748_320_000), true);

  const now = 1_785_813_065_805; // ~ Aug 3, 2026 evening CT
  assert.equal(normalizePublishedAt(0, now), now);
  assert.equal(normalizePublishedAt(undefined, now), now);
  assert.equal(normalizePublishedAt(1_785_748_320_000, now), 1_785_748_320_000);

  assert.equal(formatPublishedAt(0), "");

  // Fixed instant: 2026-08-03T17:35:00.000Z → 12:35 PM CDT in America/Chicago
  const utcMs = Date.UTC(2026, 7, 3, 17, 35, 0);
  const chicago = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  }).format(new Date(utcMs));
  assert.match(chicago, /2026/);
  assert.match(chicago, /Aug/);
  assert.match(chicago, /12:35/);

  const utcWall = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(utcMs));
  assert.match(utcWall, /5:35/);
  assert.notEqual(chicago, utcWall);

  // Helper defaults to Central (not browser-local / not forced UTC).
  const label = formatPublishedAt(utcMs);
  assert.ok(label.length > 0);
  assert.match(label, /2026/);
  assert.match(label, /12:35/);
  assert.doesNotMatch(label, /1970/);
  assert.match(label, /C[DS]T|GMT-5|GMT-6/i);

  const eastern = formatPublishedAt(utcMs, "America/New_York");
  assert.match(eastern, /1:35/);
  assert.notEqual(label, eastern);

  console.log("format-published-at-tests: ok");
}

main();
