import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { validateSignup } from "@/lib/validation";

export const dynamic = "force-dynamic";

// POST /api/auth/signup  — create an account and start a session.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = validateSignup(body);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Validation failed", details: result.errors },
      { status: 400 },
    );
  }

  const db = getDb();
  if (await db.users.getByEmail(result.value.email)) {
    return NextResponse.json(
      { error: "An account with that email already exists" },
      { status: 409 },
    );
  }

  const user = await db.users.create({
    email: result.value.email,
    name: result.value.name,
    passwordHash: hashPassword(result.value.password),
  });
  await startSession(user.id);
  return NextResponse.json({ data: user }, { status: 201 });
}
