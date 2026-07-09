import { v } from "convex/values";
import { query } from "./_generated/server";
import { resolveDisplayUsernameMap } from "./auth/displayIdentity";

/** Batch resolve userKeys → canonical display usernames (read-only). */
export const resolveLabels = query({
  args: { userKeys: v.array(v.string()) },
  handler: async (ctx, { userKeys }) => {
    return resolveDisplayUsernameMap(ctx, userKeys);
  },
});
