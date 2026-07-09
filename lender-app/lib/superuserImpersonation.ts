export const IMPERSONATION_COOKIE_NAME = "dlc_impersonation";

export type SuperuserImpersonationState = {
  targetOrganizationId: string;
  targetOrganizationName: string;
  mode: "readonly" | "operator";
  expiresAt: number;
  publicId: string;
};

export function parseImpersonationCookie(
  raw: string | undefined,
): { publicId: string; secret: string } | null {
  if (!raw || typeof raw !== "string") return null;
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;
  const publicId = raw.slice(0, dot);
  const secret = raw.slice(dot + 1);
  if (!publicId || !secret || publicId.includes(".") || secret.includes(".")) {
    return null;
  }
  return { publicId, secret };
}

export function formatImpersonationCookie(publicId: string, secret: string): string {
  return `${publicId}.${secret}`;
}
