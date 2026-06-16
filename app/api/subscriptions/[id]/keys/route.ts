import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/subscriptions/:id/keys  — mint an additional key for a subscription.
// Plaintext is returned ONCE.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const sub = await db.subscriptions.getById(id);
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sub.userId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (sub.status !== "active") {
    return NextResponse.json(
      { error: "Subscription is not active" },
      { status: 409 },
    );
  }

  let label = "default";
  try {
    const body = (await req.json()) as { label?: string };
    if (body.label && typeof body.label === "string") label = body.label.trim();
  } catch {
    /* optional */
  }

  const key = await db.apiKeys.create(id, label || "default");
  return NextResponse.json(
    { data: { apiKey: key.plaintext, keyPrefix: key.keyPrefix, id: key.id } },
    { status: 201 },
  );
}
