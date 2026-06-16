import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { parsePlans, validateNewApi } from "@/lib/validation";
import type { ApiStatus } from "@/lib/db/types";

export const dynamic = "force-dynamic";

// GET /api/apis?q=&category=&status=&mine=1
// status defaults to "published"; status=all includes drafts. mine=1 restricts
// to the signed-in user's own listings.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const status: ApiStatus | undefined =
    statusParam === "all" ? undefined : ((statusParam as ApiStatus) ?? "published");

  let ownerId: string | undefined;
  if (searchParams.get("mine") === "1") {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    ownerId = user.id;
  }

  const apis = await getDb().apis.list({
    q: searchParams.get("q") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    status: ownerId ? undefined : status,
    ownerId,
  });
  return NextResponse.json({ data: apis });
}

// POST /api/apis  — publish a new API (auth required; caller becomes owner).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in to publish an API" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = validateNewApi(body);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Validation failed", details: result.errors },
      { status: 400 },
    );
  }

  const created = await getDb().apis.create(
    { ...result.value, ownerId: user.id },
    parsePlans(body),
  );
  return NextResponse.json({ data: created }, { status: 201 });
}
