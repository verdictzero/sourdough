import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/keys/:id  — revoke a single API key (owner/admin only).
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  // Authorize via the key's subscription owner.
  const subs = await db.subscriptions.listForUser(user.id);
  const owns =
    user.role === "admin" ||
    subs.some((s) => s.keys.some((k) => k.id === id));
  if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const revoked = await db.apiKeys.revoke(id);
  if (!revoked) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: revoked });
}
