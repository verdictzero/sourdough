import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { fetchSpecFromUrl, parseAndValidate } from "@/lib/spec";
import type { ApiListing, SpecSource, User } from "@/lib/db/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

function canManage(user: User | null, api: ApiListing): boolean {
  if (!user) return false;
  return user.role === "admin" || api.ownerId === user.id;
}

// PUT /api/apis/:slug/spec  { raw? , url? , source? }  — set/replace the spec.
export async function PUT(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const db = getDb();
  const api = await db.apis.getBySlug(slug);
  if (!api) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManage(await getCurrentUser(), api)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { raw?: string; url?: string; source?: string } = {};
  try {
    body = (await req.json()) as { raw?: string; url?: string; source?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let raw = typeof body.raw === "string" ? body.raw : "";
  let sourceUrl: string | null = null;
  let source: SpecSource =
    body.source === "url" || body.source === "upload" ? body.source : "paste";

  if (body.url) {
    sourceUrl = body.url;
    source = "url";
    const fetched = await fetchSpecFromUrl(body.url, new URL(req.url).origin);
    if (!fetched.ok) {
      return NextResponse.json(
        { error: "Validation failed", details: fetched.errors },
        { status: 400 },
      );
    }
    raw = fetched.value;
  }

  const result = await parseAndValidate(raw);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Validation failed", details: result.errors },
      { status: 400 },
    );
  }

  const spec = await db.specs.upsert({
    apiId: api.id,
    format: result.value.format,
    source,
    sourceUrl,
    doc: result.value.doc,
    title: result.value.title,
    openapiVersion: result.value.openapiVersion,
    opCount: result.value.opCount,
  });

  return NextResponse.json({
    data: { title: spec.title, openapiVersion: spec.openapiVersion, opCount: spec.opCount },
  });
}

// DELETE /api/apis/:slug/spec  — remove the stored spec.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const db = getDb();
  const api = await db.apis.getBySlug(slug);
  if (!api) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManage(await getCurrentUser(), api)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const deleted = await db.specs.remove(api.id);
  return NextResponse.json({ data: { deleted } });
}
