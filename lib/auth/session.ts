// Cookie-backed sessions. Server-only (reads the DB + the cookie store).
//
// A random opaque token lives in an httpOnly cookie and maps to a row in
// `sessions`. getCurrentUser() is safe to call from Server Components (read);
// startSession/endSession mutate the cookie and must run in a Route Handler or
// Server Action.

import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import type { User } from "@/lib/db/types";

const COOKIE = "sd_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function startSession(userId: string): Promise<void> {
  const session = await getDb().sessions.create(userId, TTL_MS);
  const store = await cookies();
  store.set(COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt),
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await getDb().sessions.delete(token);
  store.delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const session = await getDb().sessions.getValid(token);
  if (!session) return null;
  return getDb().users.getById(session.userId);
}
