/**
 * Phase 12.2 Step 8C — display normalization production proof.
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  canonicalDisplayUsername,
  canonicalDisplayUsernameFromAuthUser,
} from "../auth/displayIdentity";
import { findAuthUserByCanonicalLogin } from "../auth/canonicalIdentity";
import { tryGetAuthUserByPermissionKey } from "../auth/globalAdmin";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER_ID = "ts7d3keadq48gay3pa8k6gdwx9878p33";
const JOSHUA_LOGIN = "joshua@directlendingconnection.com";
const EBALLARD_CANONICAL = "joshuaeballard@gmail.com";
const EMAIL_VARIANTS = [
  "JoshuaEBallard@gmail.com",
  "JOSHUAEBALLARD@GMAIL.COM",
] as const;

export const runDisplayNormalizationProof = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);

    const joshuaAuth = await tryGetAuthUserByPermissionKey(ctx, JOSHUA_USER_ID);
    const eballardAuth = await tryGetAuthUserByPermissionKey(
      ctx,
      EBALLARD_USER_ID,
    );

    const variantChecks = [];
    for (const input of EMAIL_VARIANTS) {
      const auth = await findAuthUserByCanonicalLogin(ctx, input);
      variantChecks.push({
        input,
        authUserId: auth ? String(auth._id) : null,
        canonicalDisplay: auth
          ? canonicalDisplayUsernameFromAuthUser(auth)
          : null,
      });
    }

    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID),
      )
      .collect();

    const memberLabels: Array<{
      userKey: string;
      canonicalDisplayUsername: string;
    }> = [];
    for (const m of members) {
      const auth = await tryGetAuthUserByPermissionKey(ctx, m.userKey);
      memberLabels.push({
        userKey: m.userKey,
        canonicalDisplayUsername: auth
          ? canonicalDisplayUsernameFromAuthUser(auth)
          : canonicalDisplayUsername(m.userKey),
      });
    }

    const joshuaLabel = joshuaAuth
      ? canonicalDisplayUsernameFromAuthUser(joshuaAuth)
      : "";
    const eballardLabel = eballardAuth
      ? canonicalDisplayUsernameFromAuthUser(eballardAuth)
      : "";

    const pass =
      joshuaLabel === JOSHUA_LOGIN &&
      eballardLabel === EBALLARD_CANONICAL &&
      variantChecks.every(
        (v) =>
          v.authUserId === EBALLARD_USER_ID &&
          v.canonicalDisplay === EBALLARD_CANONICAL,
      ) &&
      memberLabels.some(
        (m) =>
          m.userKey === JOSHUA_USER_ID && m.canonicalDisplayUsername === JOSHUA_LOGIN,
      ) &&
      memberLabels.some(
        (m) =>
          m.userKey === EBALLARD_USER_ID &&
          m.canonicalDisplayUsername === EBALLARD_CANONICAL,
      ) &&
      !memberLabels.some((m) => m.canonicalDisplayUsername.includes("mx76")) &&
      !memberLabels.some((m) =>
        /direct lending connection|e2e primary/i.test(m.canonicalDisplayUsername),
      );

    return {
      pass,
      joshuaLabel,
      eballardLabel,
      expectedJoshua: JOSHUA_LOGIN,
      expectedEballard: EBALLARD_CANONICAL,
      emailVariants: variantChecks,
      memberLabels,
    };
  },
});
