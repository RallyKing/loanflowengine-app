/**
 * Unit checks for interactive portal builder preview routes.
 * Run: npx tsx scripts/portal-preview-routes-tests.ts
 */

import assert from "node:assert/strict";
import {
  isPortalPreviewDashboardRoute,
  portalPreviewCtaRoute,
  portalPreviewRouteLabel,
  sectionsForPortalPreviewRoute,
} from "../lib/portalPreviewRoutes";

function main() {
  assert.equal(isPortalPreviewDashboardRoute("dashboard"), true);
  assert.equal(isPortalPreviewDashboardRoute(undefined), true);
  assert.equal(isPortalPreviewDashboardRoute("documents"), false);

  assert.equal(portalPreviewRouteLabel("messages"), "Messages");
  assert.equal(portalPreviewRouteLabel("profile"), "Profile");

  const available = [
    { sectionId: "outstanding_documents" as const, enabled: true },
    { sectionId: "chat" as const, enabled: true },
    { sectionId: "welcome" as const, enabled: true },
    { sectionId: "document_package" as const, enabled: false },
  ];

  assert.deepEqual(sectionsForPortalPreviewRoute("documents", available), [
    "outstanding_documents",
  ]);
  assert.deepEqual(sectionsForPortalPreviewRoute("messages", available), [
    "chat",
  ]);
  assert.deepEqual(sectionsForPortalPreviewRoute("settings", available), []);

  assert.equal(portalPreviewCtaRoute("chat"), "messages");
  assert.equal(portalPreviewCtaRoute("outstanding_documents"), "documents");
  assert.equal(portalPreviewCtaRoute("welcome"), null);

  console.log("portal-preview-routes-tests: ok");
}

main();
