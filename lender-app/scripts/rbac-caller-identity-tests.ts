/**
 * P0-02 / Prompt 02 — prove RBAC identity binding.
 *
 * - Spoofed memberUserKey that disagrees with JWT → Unauthorized
 * - Empty key without CONVEX_ALLOW_PLATFORM_KEY_FALLBACK → Unauthorized
 *   (no silent APP_AUTH_USER_KEY platform fallback on public paths)
 * - Matching JWT subject succeeds
 * - organizationRbac assert* paths no longer call platformUserKeyFallback
 *
 * Run: `npm run test:rbac-caller-identity`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { UserIdentity } from "convex/server";
import type { MutationCtx, QueryCtx } from "../convex/_generated/server";
import { requireAuthenticatedCaller } from "../convex/callerAuth";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`ok — ${name}`);
  } catch (e) {
    console.error(`FAIL — ${name}`);
    throw e;
  }
}

type MockIdentity = Pick<UserIdentity, "subject" | "email" | "issuer"> | null;

function mockCtx(identity: MockIdentity): QueryCtx | MutationCtx {
  return {
    auth: {
      getUserIdentity: async () => identity as UserIdentity | null,
    },
    db: {
      query: () => ({
        withIndex: () => ({
          collect: async () => [],
          unique: async () => null,
          first: async () => null,
        }),
      }),
      get: async () => null,
    },
  } as unknown as QueryCtx | MutationCtx;
}

async function main() {
  const prevFallback = process.env.CONVEX_ALLOW_PLATFORM_KEY_FALLBACK;
  const prevAppAuth = process.env.APP_AUTH_USER_KEY;
  delete process.env.CONVEX_ALLOW_PLATFORM_KEY_FALLBACK;
  delete process.env.APP_AUTH_USER_KEY;

  try {
    await test(
      "mismatched JWT subject vs memberUserKey throws Unauthorized",
      async () => {
        const ctx = mockCtx({
          subject: "jwt-subject-user-aaa",
          email: "member@example.com",
          issuer: "https://example.test",
        });
        await assert.rejects(
          () => requireAuthenticatedCaller(ctx, "spoofed-victim-admin-key"),
          (err: unknown) =>
            err instanceof Error && err.message === "Unauthorized",
        );
      },
    );

    await test(
      "empty memberUserKey without JWT throws Unauthorized (no platform fallback)",
      async () => {
        const ctx = mockCtx(null);
        await assert.rejects(
          () => requireAuthenticatedCaller(ctx, undefined),
          (err: unknown) =>
            err instanceof Error && err.message === "Unauthorized",
        );
        await assert.rejects(
          () => requireAuthenticatedCaller(ctx, "   "),
          (err: unknown) =>
            err instanceof Error && err.message === "Unauthorized",
        );
      },
    );

    await test(
      "spoofed memberUserKey without JWT and without membership throws Unauthorized",
      async () => {
        const ctx = mockCtx(null);
        await assert.rejects(
          () => requireAuthenticatedCaller(ctx, "spoofed-victim-admin-key"),
          (err: unknown) =>
            err instanceof Error && err.message === "Unauthorized",
        );
      },
    );

    await test(
      "matching JWT subject is returned as caller identity",
      async () => {
        const ctx = mockCtx({
          subject: "jwt-subject-user-aaa",
          email: "member@example.com",
          issuer: "https://example.test",
        });
        const key = await requireAuthenticatedCaller(
          ctx,
          "jwt-subject-user-aaa",
        );
        assert.equal(key, "jwt-subject-user-aaa");
      },
    );

    await test("JWT alone (no memberUserKey arg) binds to subject", async () => {
      const ctx = mockCtx({
        subject: "jwt-only-subject",
        email: "member@example.com",
        issuer: "https://example.test",
      });
      const key = await requireAuthenticatedCaller(ctx, undefined);
      assert.equal(key, "jwt-only-subject");
    });

    await test(
      "organizationRbac assert* paths do not use platformUserKeyFallback",
      () => {
        const here = dirname(fileURLToPath(import.meta.url));
        const src = readFileSync(
          join(here, "../convex/organizationRbac.ts"),
          "utf8",
        );
        assert.equal(
          /from\s+["']\.\/viewerIdentity["']/.test(src) &&
            /platformUserKeyFallback/.test(src),
          false,
          "organizationRbac must not import platformUserKeyFallback",
        );
        assert.doesNotMatch(
          src,
          /import\s*\{[^}]*platformUserKeyFallback[^}]*\}\s*from/,
        );
        assert.doesNotMatch(
          src,
          /(?<![\w`])platformUserKeyFallback\s*\(/,
        );
        assert.match(
          src,
          /requireAuthenticatedCaller/,
          "assertOrgPermission must resolve identity via requireAuthenticatedCaller",
        );
        const assertOrgBlock = src.slice(
          src.indexOf("export async function assertOrgPermission"),
          src.indexOf("export async function assertAnyOrgPermission"),
        );
        const assertAnyBlock = src.slice(
          src.indexOf("export async function assertAnyOrgPermission"),
          src.indexOf("export async function seedSystemRolesForOrganization"),
        );
        assert.match(
          assertOrgBlock,
          /requireAuthenticatedCaller\(ctx,\s*userKey\)/,
        );
        assert.match(
          assertAnyBlock,
          /requireAuthenticatedCaller\(ctx,\s*userKey\)/,
        );
        assert.doesNotMatch(assertOrgBlock, /APP_AUTH_USER_KEY/);
        assert.doesNotMatch(assertAnyBlock, /APP_AUTH_USER_KEY/);
        assert.doesNotMatch(assertOrgBlock, /platformUserKeyFallback\s*\(/);
        assert.doesNotMatch(assertAnyBlock, /platformUserKeyFallback\s*\(/);
      },
    );
  } finally {
    if (prevFallback !== undefined) {
      process.env.CONVEX_ALLOW_PLATFORM_KEY_FALLBACK = prevFallback;
    }
    if (prevAppAuth !== undefined) {
      process.env.APP_AUTH_USER_KEY = prevAppAuth;
    }
  }

  console.log(`\n${passed} rbac-caller-identity checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
