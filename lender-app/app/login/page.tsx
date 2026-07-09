import type { Metadata } from "next";
import { APP_DISPLAY_NAME } from "@/lib/brandIdentity";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: `Sign in — ${APP_DISPLAY_NAME}`,
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string | string[] }>;

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = pickFirst(params.next) ?? "/";
  const devPrefill =
    process.env.NODE_ENV === "development"
      ? {
          defaultUsername: process.env.LOGIN_DEV_PREFILL_USERNAME?.trim() ?? "",
          defaultPassword: process.env.LOGIN_DEV_PREFILL_PASSWORD?.trim() ?? "",
        }
      : {};
  return <LoginForm next={next} {...devPrefill} />;
}
