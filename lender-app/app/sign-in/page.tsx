import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { APP_DISPLAY_NAME, APP_HOME_HREF } from "@/lib/brandIdentity";

export const metadata: Metadata = {
  title: `Sign in — ${APP_DISPLAY_NAME}`,
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string | string[] }>;

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** `/sign-in` is retained as a stable redirect to `/login`. */
export default async function SignInRedirectPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = pickFirst(params.next) ?? APP_HOME_HREF;
  redirect(`/login?next=${encodeURIComponent(next)}`);
}
