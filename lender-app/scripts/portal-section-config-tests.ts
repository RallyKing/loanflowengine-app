/**
 * Unit checks for portal section config sanitize + tokens.
 * Run: npx tsx scripts/portal-section-config-tests.ts
 */

import assert from "node:assert/strict";
import {
  applyPortalWelcomeTokens,
  sanitizePortalSectionProps,
} from "../lib/portalSectionConfig";
import { makeSectionInstance, sanitizePortalPageSections } from "../lib/portalPageSections";

function main() {
  const welcome = sanitizePortalSectionProps("welcome", {
    welcomeBody: "Hi {{workspaceName}} — {{fileLabel}}",
    titleOverride: "Hello",
  });
  assert.equal(welcome?.titleOverride, "Hello");
  assert.ok(welcome?.welcomeBody?.includes("workspaceName"));

  const status = sanitizePortalSectionProps("status_pipeline_stage", {
    statusMode: "custom_checklist",
    statusSteps: [
      { id: "pst_keep", label: "Step A", order: 0 },
      { id: "pst_keep", label: "dup id ignored", order: 1 },
      { label: "no id", order: 2 },
    ],
  });
  assert.equal(status?.statusMode, "custom_checklist");
  assert.ok((status?.statusSteps?.length ?? 0) >= 2);
  assert.equal(status?.statusSteps?.[0]?.id, "pst_keep");

  const contact = sanitizePortalSectionProps("company_primary_contact", {
    contactSource: "custom",
    customContact: { name: "Sam", email: "sam@example.com" },
  });
  assert.equal(contact?.contactSource, "custom");
  assert.equal(contact?.customContact?.name, "Sam");

  const tokenized = applyPortalWelcomeTokens("Hello {{workspaceName}} / {{fileLabel}}", {
    workspaceName: "Acme",
    fileLabel: "File 1",
  });
  assert.equal(tokenized, "Hello Acme / File 1");

  const inst = makeSectionInstance("chat");
  assert.equal(inst.props?.chatEnabled, true);

  const sanitized = sanitizePortalPageSections("client", [
    {
      instanceId: "x",
      sectionId: "status_pipeline_stage",
      props: {
        statusMode: "custom_checklist",
        statusSteps: [{ id: "a", label: "One" }],
      },
    },
  ]);
  assert.equal(sanitized[0]?.props?.statusMode, "custom_checklist");
  assert.equal(sanitized[0]?.props?.statusSteps?.[0]?.label, "One");

  console.log("portal-section-config-tests: ok");
}

main();
