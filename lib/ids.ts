// Small id / key / hash / slug helpers. Pure functions, no storage knowledge.

import { createHash, randomBytes, randomUUID } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

/**
 * Generate a fresh API key (the plaintext handed to the consumer exactly once).
 * Only its hash + a display prefix are persisted — see hashKey / keyPrefix.
 */
export function generateApiKey(): string {
  return "sd_live_" + randomBytes(24).toString("hex");
}

/** SHA-256 hex — used to store API keys without keeping the plaintext. */
export function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Short, safe-to-display prefix of a key, e.g. "sd_live_1a2b3c…". */
export function keyPrefix(plaintext: string): string {
  return plaintext.slice(0, 16);
}

/** URL-safe slug from a display name. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "api"
  );
}
