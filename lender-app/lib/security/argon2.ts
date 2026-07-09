import argon2 from "argon2";
import { authBridgeStructuredError } from "../auth/authStructuredError";

function looksLikeArgon2ModularHash(hash: string): boolean {
  return typeof hash === "string" && hash.trim().startsWith("$argon2");
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(
  hash: string,
  plain: string,
  context?: Record<string, unknown>,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch (e) {
    if (!looksLikeArgon2ModularHash(hash)) {
      return false;
    }
    throw authBridgeStructuredError("verifyPassword", {
      reason: e instanceof Error ? e.message : "argon2_verify_threw",
      passwordHashPresent: Boolean(hash?.trim?.()),
      ...(context ?? {}),
    });
  }
}
