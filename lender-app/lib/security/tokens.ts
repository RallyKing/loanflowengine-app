import { createHash, randomBytes } from "crypto";

export function sha256HexFromUtf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function randomUrlToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
