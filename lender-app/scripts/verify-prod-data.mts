import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url =
  process.env.PROD_CONVEX_URL ??
  "https://basic-anaconda-984.convex.cloud";
const adminKey = process.env.CONVEX_DEPLOY_KEY;
if (!adminKey) {
  console.error("CONVEX_DEPLOY_KEY is required");
  process.exit(1);
}

const client = new ConvexHttpClient(url);
client.setAdminAuth(adminKey);

const ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf";
const USER_KEY = "user_3DKA3dCn7Wd8A7aN54fYbGor7Jc";

async function main() {
  console.log(`Probing ${url} as orgId=${ORG_ID}\n`);

  const lenders = (await client.query(anyApi.lenders.list, {
    organizationId: ORG_ID,
    memberUserKey: USER_KEY,
    limit: 10000,
  })) as Array<{ _id: string; company?: string; companyKey?: string }>;
  console.log(`lenders.list -> ${lenders.length} rows`);
  console.log(
    "  first 5:",
    lenders.slice(0, 5).map((r) => r.company ?? r.companyKey ?? r._id).join(", "),
  );

  const stats = await client.query(anyApi.lenders.stats, {
    organizationId: ORG_ID,
    memberUserKey: USER_KEY,
  });
  console.log("lenders.stats ->", JSON.stringify(stats));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
