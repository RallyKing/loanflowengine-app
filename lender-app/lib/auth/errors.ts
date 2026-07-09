export const AuthErrorCodes = {
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  RATE_LIMITED: "RATE_LIMITED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_REVOKED: "SESSION_REVOKED",
  SESSION_INVALIDATED: "SESSION_INVALIDATED",
  INVALID_TOKEN: "INVALID_TOKEN",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  EMAIL_UNVERIFIED: "EMAIL_UNVERIFIED",
  CSRF_FAILED: "CSRF_FAILED",
  USERNAME_TAKEN: "USERNAME_TAKEN",
  INVALID_RESET_TOKEN: "INVALID_RESET_TOKEN",
} as const;

export type AuthErrorCode = (typeof AuthErrorCodes)[keyof typeof AuthErrorCodes];

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "AuthError";
  }
}
