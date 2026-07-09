import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { APP_DISPLAY_NAME } from "@/lib/brandIdentity";

export const metadata: Metadata = {
  title: `Sign up — ${APP_DISPLAY_NAME}`,
};

export const dynamic = "force-dynamic";

/** Legacy path `/sign-up` redirects to `/signup`. */
export default function SignUpLegacyRedirectPage() {
  redirect("/signup");
}
