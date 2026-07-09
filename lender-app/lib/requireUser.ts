import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/sessionAuth";

/**
 * Server-only guard for App Router layouts. Redirects to `/login` when there
 * is no valid signed session cookie. Returns the canonical `userKey`.
 *
 * Defense in depth alongside the cookie gate in `middleware.ts`.
 */
export async function requireUser(): Promise<string> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);
  if (!session) {
    redirect("/sign-in");
  }
  return session.userKey;
}
