import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";

async function main() {
  const url =
    process.env.PROD_CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
  const adminKey = process.env.CONVEX_DEPLOY_KEY?.trim();
  if (!url) {
    console.error("PROD_CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is required.");
    process.exit(1);
  }
  if (!adminKey) {
    console.error("CONVEX_DEPLOY_KEY env var is required (prod deploy key)");
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

  console.log(`Running legacyAssignToOwner:run against ${url}`);
  console.log(`  organizationId = ${organizationIdRaw ?? "(omit — match by name)"}`);
  console.log(`  ownerUserKey   = ${args.ownerUserKey}`);
  console.log(`  orgName        = ${args.orgName}`);

  const result = await client.mutation(anyApi.legacyAssignToOwner.run, args);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
