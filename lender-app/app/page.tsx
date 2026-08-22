import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PublicLandingPage } from "@/components/marketing/PublicLandingPage";
import { APP_HOME_HREF } from "@/lib/brandIdentity";
import {
  MARKETING_BRAND_NAME,
  MARKETING_DESCRIPTION,
  MARKETING_TAGLINE,
} from "@/lib/marketingBrand";
import { IMPERSONATION_COOKIE_NAME } from "@/lib/superuserImpersonation";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/sessionAuth";

export const metadata: Metadata = {
  title: `${MARKETING_BRAND_NAME} — ${MARKETING_TAGLINE}`,
  description: MARKETING_DESCRIPTION,
};

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const impersonationToken = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
  const session = await verifySession(token, impersonationToken);

  if (session) {
    redirect(APP_HOME_HREF);
  }

  return <PublicLandingPage />;
}
