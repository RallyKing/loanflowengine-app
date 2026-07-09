import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";

async function main() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210";
  const adminKey = process.env.CONVEX_ADMIN_KEY?.trim();
  if (!adminKey) {
    console.error("Set CONVEX_ADMIN_KEY for admin access to run this script.");
    process.exit(1);
  }
  const client = new ConvexHttpClient(url);
  client.setAdminAuth(adminKey);

  const ownerUserKey = process.env.LEGACY_ASSIGN_OWNER_USER_KEY?.trim() ?? "";
  const orgName = process.env.LEGACY_ASSIGN_ORG_NAME?.trim() ?? "Organization";
  const organizationIdRaw = process.env.LEGACY_ASSIGN_ORGANIZATION_ID?.trim();

  if (!ownerUserKey) {
    console.error("LEGACY_ASSIGN_OWNER_USER_KEY is required.");
    process.exit(1);
  }

  const args = {
    ownerUserKey,
    orgName,
    ...(organizationIdRaw
      ? { organizationId: organizationIdRaw as Id<"organizations"> }
      : {}),
  };

  const result = await client.mutation(anyApi.legacyAssignToOwner.run, args);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
