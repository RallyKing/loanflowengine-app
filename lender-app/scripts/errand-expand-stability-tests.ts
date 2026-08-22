/**
 * Guard: grocery/errand expand UI must not reseed on every Convex task patch.
 * Run: npx tsx scripts/errand-expand-stability-tests.ts
 */

import assert from "node:assert/strict";
import {
  defaultErrandListStartsExpanded,
  shouldReseedErrandExpandUi,
} from "../components/ErrandListInline";
import type { Doc } from "../convex/_generated/dataModel";

function fakeErrand(partial: {
  stores: number;
  itemsPerStore: number;
}): Doc<"tasks"> {
  const locations = Array.from({ length: partial.stores }, (_, si) => ({
    id: `store-${si}`,
    name: `Store ${si + 1}`,
    completed: false,
    items: Array.from({ length: partial.itemsPerStore }, (_, ii) => ({
      id: `item-${si}-${ii}`,
      name: `Item ${ii + 1}`,
      completed: false,
    })),
  }));
  return {
    _id: "jd7fake" as Doc<"tasks">["_id"],
    _creationTime: 0,
    title: "Weekly groceries",
    type: "errands_groceries",
    category: "errand",
    status: "todo",
    quadrant: 2,
    priority: 0,
    organizationId: "org" as Doc<"tasks">["organizationId"],
    createdAt: 0,
    updatedAt: 0,
    errandLocations: locations,
  };
}

function main() {
  assert.equal(
    shouldReseedErrandExpandUi({
      prevId: "a",
      prevType: "errands_groceries",
      nextId: "a",
      nextType: "errands_groceries",
    }),
    false,
    "same task + type after checkbox must NOT reseed expand UI"
  );

  assert.equal(
    shouldReseedErrandExpandUi({
      prevId: "a",
      prevType: "errands_groceries",
      nextId: "b",
      nextType: "errands_groceries",
    }),
    true,
    "different task id reseeds"
  );

  assert.equal(
    shouldReseedErrandExpandUi({
      prevId: "a",
      prevType: "work",
      nextId: "a",
      nextType: "errands_groceries",
    }),
    true,
    "type change to errands reseeds"
  );

  const small = fakeErrand({ stores: 2, itemsPerStore: 4 });
  assert.equal(defaultErrandListStartsExpanded(small), true);

  const large = fakeErrand({ stores: 4, itemsPerStore: 5 });
  assert.equal(
    defaultErrandListStartsExpanded(large),
    false,
    "large runs start collapsed — must stay open once user expands across patches"
  );

  const work = { ...small, type: "work" as const };
  assert.equal(defaultErrandListStartsExpanded(work), false);

  console.log("errand-expand-stability-tests: ok");
}

main();
