import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { validateLogin } from "@/lib/validation";

export const dynamic = "force-dynamic";

// POST /api/auth/login  — verify credentials and start a session.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = validateLogin(body);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Validation failed", details: result.errors },
      { status: 400 },
    );
  }

  const db = getDb();
  const user = await db.users.getByEmail(result.value.email);
  if (!user || !verifyPassword(result.value.password, user.passwordHash)) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  await startSession(user.id);
  const { passwordHash: _omit, ...safe } = user;
  void _omit;
  return NextResponse.json({ data: safe });
}
