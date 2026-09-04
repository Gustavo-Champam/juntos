import { createHash, randomBytes } from "node:crypto";

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}
