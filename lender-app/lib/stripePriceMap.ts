import type { OrganizationPlan } from "./orgPlanFeatures";

/**
 * Maps recurring Price ids (Stripe Dashboard → Products → Price id) to org plans.
 * Configure on the Convex deployment: STRIPE_PRICE_BASIC, STRIPE_PRICE_PRO,
 * STRIPE_PRICE_ENTERPRISE (secret env; never expose to the browser).
 */
export function planFromStripePriceId(
  priceId: string | undefined | null,
): OrganizationPlan | null {
  const id = priceId?.trim();
  if (!id) return null;
  const basic = process.env.STRIPE_PRICE_BASIC?.trim();
  const pro = process.env.STRIPE_PRICE_PRO?.trim();
  const enterprise = process.env.STRIPE_PRICE_ENTERPRISE?.trim();
  if (id === pro) return "pro";
  if (id === enterprise) return "enterprise";
  if (id === basic) return "basic";
  return null;
}
