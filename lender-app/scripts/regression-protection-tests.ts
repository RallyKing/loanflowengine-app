/**
 * Regression / abuse-case tests (no Convex server, no Playwright).
 * Run: `npm run verify:regression` or `tsx scripts/regression-protection-tests.ts`
 */
import assert from "node:assert/strict";
import { pickCanonicalOrgMember } from "../convex/orgMembership";
import type { Doc } from "../convex/_generated/dataModel";
import {
  parseConvexDocumentId,
  parseOrganizationId,
} from "../lib/orgIdValidation";
import {
  validateConvexDocumentIdInput,
  validateOrganizationIdInput,
} from "../lib/schema/orgScopeSchema";
import { hasOrgPermission } from "../lib/orgRbac";
import { deriveAuthMachineState } from "../lib/auth/deriveAuthState";
import { isLegacyExternalOrgId, isLegacyExternalUserId } from "../convex/dataMigration";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl";
import {
  applyDocumentCreatorTokens,
  buildDocumentEditorImageInsertHtml,
  sanitizeDocumentEditorImageUrl,
} from "../modules/pipeline/lib/core/documentVaultCreator";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`ok — ${name}`);
  } catch (e) {
    console.error(`FAIL — ${name}`);
    throw e;
  }
}

const validOrgLen32 = "j57abc89de0123456789abcdefghij"; // 32 chars, fake

test("parseConvexDocumentId: rejects malformed org ids", () => {
  assert.equal(parseConvexDocumentId(null), null);
  assert.equal(parseConvexDocumentId(""), null);
  assert.equal(parseConvexDocumentId("short"), null);
  assert.equal(parseConvexDocumentId("UPPERCASEnotallowedheres"), null);
  assert.equal(parseConvexDocumentId("has-dash-not-allowed"), null);
  assert.equal(parseConvexDocumentId(`${"a".repeat(97)}`), null);
  assert.ok(parseConvexDocumentId(validOrgLen32));
});

test("parseOrganizationId matches parseConvexDocumentId typing", () => {
  assert.equal(parseOrganizationId(validOrgLen32), validOrgLen32);
});

test("validateOrganizationIdInput: structured errors", () => {
  assert.deepEqual(validateOrganizationIdInput(undefined), {
    ok: false,
    code: "missing",
  });
  assert.deepEqual(validateOrganizationIdInput(123), {
    ok: false,
    code: "wrong_type",
  });
  assert.deepEqual(validateOrganizationIdInput("!!!!badcharset"), {
    ok: false,
    code: "malformed",
  });
  const ok = validateOrganizationIdInput(validOrgLen32);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.organizationId, validOrgLen32);
});

test("validateConvexDocumentIdInput mirrors org validator shape", () => {
  assert.equal(validateConvexDocumentIdInput("nope").ok, false);
  assert.ok(validateConvexDocumentIdInput(validOrgLen32).ok);
});

test("pickCanonicalOrgMember: duplicate rows pick newest _creationTime", () => {
  const orgId = validOrgLen32 as Doc<"organizationMembers">["organizationId"];
  const older = {
    _id: "a" as Doc<"organizationMembers">["_id"],
    _creationTime: 100,
    organizationId: orgId,
    userKey: "user",
    role: "member" as const,
  } as Doc<"organizationMembers">;
  const newer = {
    ...older,
    _id: "b" as Doc<"organizationMembers">["_id"],
    _creationTime: 200,
  };
  const pick = pickCanonicalOrgMember([older, newer]);
  assert.equal(pick?._id, newer._id);
  assert.equal(pickCanonicalOrgMember([]), null);
});

test("hasOrgPermission: null/undefined granted → false (no throw)", () => {
  assert.equal(hasOrgPermission(undefined, "files.view"), false);
  assert.equal(hasOrgPermission(null, "files.view"), false);
  assert.equal(hasOrgPermission(["files.view"], "files.view"), true);
});

test("hasOrgPermission: impersonation-style sets still work", () => {
  assert.equal(
    hasOrgPermission(new Set(["files.edit"]), "files.view"),
    true,
  );
});

test("deriveAuthMachineState: stale / invalid session", () => {
  assert.equal(
    deriveAuthMachineState({
      viewerPresent: true,
      clientHydrated: true,
      sessionInvalid: "expired",
      convexPhase: "connected",
      connectionRetries: 0,
      browserOnline: true,
      isWebSocketConnected: true,
    }),
    "expired",
  );
  assert.equal(
    deriveAuthMachineState({
      viewerPresent: true,
      clientHydrated: true,
      sessionInvalid: null,
      convexPhase: "reconnecting",
      connectionRetries: 99,
      browserOnline: true,
      isWebSocketConnected: false,
    }),
    "degraded",
  );
  assert.equal(
    deriveAuthMachineState({
      viewerPresent: false,
      clientHydrated: true,
      sessionInvalid: null,
      convexPhase: "connected",
      connectionRetries: 0,
      browserOnline: true,
      isWebSocketConnected: false,
    }),
    "unauthenticated",
  );
});

test("deriveAuthMachineState: websocket disconnected + offline → degraded", () => {
  assert.equal(
    deriveAuthMachineState({
      viewerPresent: true,
      clientHydrated: true,
      sessionInvalid: null,
      convexPhase: "connected",
      connectionRetries: 0,
      browserOnline: false,
      isWebSocketConnected: false,
    }),
    "degraded",
  );
});

test("deriveAuthMachineState: websocket disconnected + online + connecting → loading", () => {
  assert.equal(
    deriveAuthMachineState({
      viewerPresent: true,
      clientHydrated: true,
      sessionInvalid: null,
      convexPhase: "connecting",
      connectionRetries: 0,
      browserOnline: true,
      isWebSocketConnected: false,
    }),
    "loading",
  );
});

test("Convex URL: invalid deployment → sync cannot start (parse failure)", () => {
  assert.equal(parseConvexPublicUrl("wss://evil.example/ws").ok, false);
  assert.equal(parseConvexPublicUrl("not-a-url").ok, false);
});

test("Legacy external id shape sentinels (migration guards)", () => {
  assert.equal(isLegacyExternalUserId("user_2abc123xyz"), true);
  assert.equal(isLegacyExternalUserId(validOrgLen32), false);
  assert.equal(isLegacyExternalUserId("user_ab"), false);
  assert.equal(isLegacyExternalOrgId("org_2abc123xyz"), true);
  assert.equal(isLegacyExternalOrgId("org_ab"), false);
  assert.equal(isLegacyExternalOrgId(validOrgLen32), false);
});

test("document creator: token hydration escapes HTML", () => {
  const out = applyDocumentCreatorTokens("<p>{{borrower_name}}</p>", {
    borrower_name: "O'Brien & Co",
  });
  assert.equal(out, "<p>O'Brien &amp; Co</p>");
});

test("document creator: image URL sanitizer rejects data URIs", () => {
  assert.equal(sanitizeDocumentEditorImageUrl("https://cdn.example/x.png"), "https://cdn.example/x.png");
  assert.equal(sanitizeDocumentEditorImageUrl("data:image/png;base64,xx"), null);
});

test("document creator: image insert HTML is responsive", () => {
  const tag = buildDocumentEditorImageInsertHtml("https://example.com/a.png");
  assert.match(tag, /data-dlc-editor-image="1"/);
});

console.log(`\nregression-protection-tests: ${passed} cases passed.\n`);
