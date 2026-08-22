/**
 * Unit checks for portal page section registry (no Convex).
 * Run: npx tsx scripts/portal-page-sections-tests.ts
 */

import assert from "node:assert/strict";
import {
  defaultSectionsForPortalType,
  sanitizePortalPageSections,
  sectionAllowedForPortalType,
  sectionsForPortalType,
  summarizePortalPageSections,
} from "../lib/portalPageSections";
import {
  defaultPortalChrome,
  sanitizePortalChrome,
} from "../lib/portalChrome";

function main() {
  const clientPalette = sectionsForPortalType("client");
  assert.ok(clientPalette.some((s) => s.id === "outstanding_documents"));
  assert.ok(!clientPalette.some((s) => s.id === "document_package"));
  assert.ok(clientPalette.some((s) => s.id === "stat_cards"));
  assert.ok(clientPalette.some((s) => s.id === "activity_feed"));

  const lenderPalette = sectionsForPortalType("lender");
  assert.ok(lenderPalette.some((s) => s.id === "document_package"));
  assert.ok(!sectionAllowedForPortalType("chat", "lender"));

  const defaults = defaultSectionsForPortalType("client");
  assert.ok(defaults.length >= 4);
  assert.equal(
    sanitizePortalPageSections("client", [
      {
        instanceId: "a",
        sectionId: "document_package" as never,
        enabled: true,
      },
      ...defaults,
    ]).every((s) => s.sectionId !== "document_package"),
    true,
  );

  const withSpan = sanitizePortalPageSections("client", [
    {
      instanceId: "wide",
      sectionId: "welcome",
      enabled: true,
      layout: { colSpan: 6, order: 0 },
    },
    {
      instanceId: "half",
      sectionId: "stat_cards",
      enabled: true,
      layout: { colSpan: 99 as never, order: 1 },
    },
  ]);
  assert.equal(withSpan[0]?.sectionId, "welcome");
  assert.equal(withSpan[0]?.layout?.colSpan, 6);
  assert.notEqual(withSpan[1]?.layout?.colSpan, 99);

  const summary = summarizePortalPageSections(defaults);
  assert.ok(summary.length > 0);
  assert.notEqual(summary, "No page sections");

  const clientChrome = defaultPortalChrome("client");
  assert.ok((clientChrome.sidebar?.items.length ?? 0) >= 3);
  assert.equal(clientChrome.top?.showWelcome, true);

  const lenderChrome = sanitizePortalChrome("lender", {
    sidebar: {
      brandLabel: "Fundrock",
      items: [
        {
          id: "x",
          label: "Dashboard",
          iconKey: "layoutDashboard",
          routeKey: "dashboard",
          order: 0,
        },
        {
          id: "bad",
          label: "Hack",
          iconKey: "not-real" as never,
          routeKey: "not-real" as never,
          order: 1,
        },
      ],
    },
  });
  assert.equal(lenderChrome.sidebar?.brandLabel, "Fundrock");
  assert.ok((lenderChrome.sidebar?.items.length ?? 0) >= 1);
  for (const item of lenderChrome.sidebar?.items ?? []) {
    assert.ok(typeof item.iconKey === "string");
    assert.ok(typeof item.routeKey === "string");
    assert.notEqual(item.iconKey, "not-real");
    assert.notEqual(item.routeKey, "not-real");
  }

  console.log("portal-page-sections-tests: ok");
}

main();
