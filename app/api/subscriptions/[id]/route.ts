import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/subscriptions/:id  — revoke the subscription (and its keys).
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const sub = await db.subscriptions.getById(id);
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sub.userId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const revoked = await db.subscriptions.revoke(id);
  return NextResponse.json({ data: revoked });
}
