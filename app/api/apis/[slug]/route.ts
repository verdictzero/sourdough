import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { pickApiPatch } from "@/lib/validation";
import type { ApiListing, User } from "@/lib/db/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/** Owner or admin may mutate a listing. */
function canManage(user: User | null, api: ApiListing): boolean {
  if (!user) return false;
  return user.role === "admin" || api.ownerId === user.id;
}

// GET /api/apis/:slug  — includes plans.
export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const api = await getDb().apis.getWithPlans(slug);
  if (!api) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: api });
}

// PATCH /api/apis/:slug  — owner/admin only.
export async function PATCH(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const db = getDb();
  const api = await db.apis.getBySlug(slug);
  if (!api) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManage(await getCurrentUser(), api)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = pickApiPatch(body);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Validation failed", details: result.errors },
      { status: 400 },
    );
  }

  const updated = await db.apis.update(api.id, result.value);
  return NextResponse.json({ data: updated });
}

// DELETE /api/apis/:slug  — owner/admin only. Cascades plans/subscriptions/keys.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const db = getDb();
  const api = await db.apis.getBySlug(slug);
  if (!api) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManage(await getCurrentUser(), api)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.apis.remove(api.id);
  return NextResponse.json({ data: { deleted: true, slug } });
}
