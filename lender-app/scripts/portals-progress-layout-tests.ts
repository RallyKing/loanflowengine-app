/**
 * Unit tests for Portals & Progress tab layout helpers.
 * Run: npx tsx scripts/portals-progress-layout-tests.ts
 */
import assert from "node:assert/strict";
import {
  defaultPortalsProgressTabLayout,
  derivePortalsProgressLayoutFromLegacy,
  isPortalsProgressSectionVisible,
  normalizePortalsProgressSectionOrder,
  parsePortalsProgressTabLayoutFromUnknown,
  syncClientPortalLayoutFromPortalsProgress,
  togglePortalsProgressSectionHidden,
} from "../lib/file/portalsProgressTabLayout";
import { defaultClientPortalTabLayout } from "../lib/file/clientPortalTabLayout";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (err) {
    console.error(`FAIL — ${name}`);
    throw err;
  }
}

test("default layout includes all core + portal sections", () => {
  const layout = defaultPortalsProgressTabLayout();
  assert.equal(layout.v, 1);
  assert.ok(layout.order.includes("scenariosLenderMatch"));
  assert.ok(layout.order.includes("financialMetrics"));
  assert.ok(layout.order.includes("actionQueue"));
  assert.ok(layout.order.includes("lenderTrack"));
  assert.ok(layout.order.includes("internalWorkflow"));
  assert.ok(layout.order.includes("contactPortalDefaults"));
  assert.ok(layout.order.includes("safeDefaults"));
  assert.equal(layout.hidden.length, 0);
});

test("normalize preserves relative order and fills missing ids", () => {
  const normalized = normalizePortalsProgressSectionOrder([
    "actionQueue",
    "scenariosLenderMatch",
    "actionQueue",
  ]);
  assert.equal(normalized[0], "actionQueue");
  assert.equal(normalized[1], "scenariosLenderMatch");
  assert.ok(normalized.includes("financialMetrics"));
  assert.equal(new Set(normalized).size, normalized.length);
});

test("parse falls back to legacy client portal order", () => {
  const layout = parsePortalsProgressTabLayoutFromUnknown(null, {
    clientPortalOrder: ["communications", "safeDefaults", "uploadsInbox", "linkSecurity"],
  });
  const portalSlice = layout.order.filter((id) =>
    ["safeDefaults", "linkSecurity", "uploadsInbox", "communications"].includes(
      id,
    ),
  );
  assert.deepEqual(portalSlice, [
    "communications",
    "safeDefaults",
    "uploadsInbox",
    "linkSecurity",
  ]);
});

test("derive puts core sections before portal sections", () => {
  const layout = derivePortalsProgressLayoutFromLegacy();
  const scenariosIdx = layout.order.indexOf("scenariosLenderMatch");
  const safeIdx = layout.order.indexOf("safeDefaults");
  assert.ok(scenariosIdx >= 0 && safeIdx > scenariosIdx);
});

test("toggle hidden + visibility", () => {
  let layout = defaultPortalsProgressTabLayout();
  assert.equal(isPortalsProgressSectionVisible(layout, "actionQueue"), true);
  layout = togglePortalsProgressSectionHidden(layout, "actionQueue");
  assert.equal(isPortalsProgressSectionVisible(layout, "actionQueue"), false);
  layout = togglePortalsProgressSectionHidden(layout, "actionQueue");
  assert.equal(isPortalsProgressSectionVisible(layout, "actionQueue"), true);
});

test("syncClientPortalLayoutFromPortalsProgress maps portal subset", () => {
  const pp = defaultPortalsProgressTabLayout();
  pp.order = normalizePortalsProgressSectionOrder([
    "scenariosLenderMatch",
    "communications",
    "financialMetrics",
    "safeDefaults",
    "actionQueue",
    "linkSecurity",
    "lenderTrack",
    "uploadsInbox",
    "internalWorkflow",
    "contactPortalDefaults",
  ]);
  pp.hidden = ["uploadsInbox"];
  const synced = syncClientPortalLayoutFromPortalsProgress(
    defaultClientPortalTabLayout(),
    pp,
  );
  assert.deepEqual(synced.order, [
    "communications",
    "safeDefaults",
    "linkSecurity",
    "uploadsInbox",
  ]);
  assert.deepEqual(synced.hidden, ["uploadsInbox"]);
});

console.log("\nAll portals-progress layout tests passed.");
