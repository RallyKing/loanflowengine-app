import type { Metadata } from "next";
import { APP_DISPLAY_NAME } from "@/lib/brandIdentity";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: `Sign up — ${APP_DISPLAY_NAME}`,
};

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return <SignupForm />;
}
