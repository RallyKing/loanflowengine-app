import assert from "node:assert/strict";
import {
  fileTaskPortalHiddenBorderClass,
  fileTaskPortalVisibilityDataAttr,
} from "../lib/library/fileTaskPortalVisibilityCue";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`fail - ${name}`);
    throw e;
  }
}

test("visible tasks use portal-visible=true and no dashed border", () => {
  assert.equal(fileTaskPortalVisibilityDataAttr(true), "true");
  assert.equal(fileTaskPortalHiddenBorderClass(true), undefined);
});

test("hidden tasks use portal-visible=false and dashed border", () => {
  assert.equal(fileTaskPortalVisibilityDataAttr(false), "false");
  assert.equal(fileTaskPortalHiddenBorderClass(false), "border-dashed");
});

console.log("file-task-portal-visibility-cue-tests: all passed");
