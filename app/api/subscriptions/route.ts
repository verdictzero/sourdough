import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// GET /api/subscriptions  — the signed-in user's subscriptions, with plan,
// keys, and this-month usage.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await getDb().subscriptions.listForUser(user.id);
  return NextResponse.json({ data });
}
