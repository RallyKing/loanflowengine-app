import assert from "node:assert/strict";
import {
  applyFicoScore,
  currentFicoFromHistory,
  ficoTrendFromHistory,
  mergeFicoHistories,
  parseFicoScore,
  seedFicoHistory,
} from "../lib/contacts/ficoHistory";

function run() {
  assert.equal(parseFicoScore("720"), 720);
  assert.equal(parseFicoScore("720.4"), 720);
  assert.equal(parseFicoScore(299), null);
  assert.equal(parseFicoScore(851), null);
  assert.equal(parseFicoScore(""), null);

  const seeded = seedFicoHistory({
    fico: 680,
    history: [],
    fallbackRecordedAt: 1_700_000_000_000,
  });
  assert.equal(seeded.length, 1);
  assert.equal(seeded[0]?.score, 680);

  const first = applyFicoScore({
    fico: undefined,
    history: [],
    nextScore: 700,
    recordedAt: 1_720_000_000_000,
    now: 1_720_000_000_100,
    fallbackRecordedAt: 1_700_000_000_000,
  });
  assert.equal(first.fico, 700);
  assert.equal(first.ficoHistory.length, 1);

  const updated = applyFicoScore({
    fico: first.fico,
    history: first.ficoHistory,
    nextScore: 740,
    recordedAt: 1_750_000_000_000,
    now: 1_750_000_000_100,
    fallbackRecordedAt: 1_700_000_000_000,
    note: "Experian",
  });
  assert.equal(updated.fico, 740);
  assert.equal(updated.ficoHistory.length, 2);
  assert.equal(updated.ficoHistory[0]?.score, 740);
  assert.equal(updated.ficoHistory[1]?.score, 700);
  assert.equal(updated.ficoHistory[0]?.note, "Experian");

  const trend = ficoTrendFromHistory(updated.ficoHistory);
  assert.equal(trend.current, 740);
  assert.equal(trend.previous, 700);
  assert.equal(trend.delta, 40);
  assert.equal(trend.direction, "up");

  const sameDay = applyFicoScore({
    fico: updated.fico,
    history: updated.ficoHistory,
    nextScore: 740,
    recordedAt: 1_750_000_100_000,
    now: 1_750_000_200_000,
    fallbackRecordedAt: 1_700_000_000_000,
    note: "Corrected pull",
  });
  assert.equal(sameDay.ficoHistory.length, 2);
  assert.equal(sameDay.ficoHistory[0]?.note, "Corrected pull");

  const merged = mergeFicoHistories(first.ficoHistory, updated.ficoHistory);
  assert.equal(currentFicoFromHistory(merged), 740);
  assert.ok(merged.length >= 2);

  const down = applyFicoScore({
    fico: updated.fico,
    history: updated.ficoHistory,
    nextScore: 710,
    recordedAt: 1_760_000_000_000,
    now: 1_760_000_000_100,
    fallbackRecordedAt: 1_700_000_000_000,
  });
  assert.equal(ficoTrendFromHistory(down.ficoHistory).direction, "down");
  assert.equal(ficoTrendFromHistory(down.ficoHistory).delta, -30);

  console.log("fico-history-tests: ok");
}

run();
