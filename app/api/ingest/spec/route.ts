import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { fetchSpecFromUrl, parseAndValidate } from "@/lib/spec";

export const dynamic = "force-dynamic";

// POST /api/ingest/spec  { raw? , url? }  — validate/preview an OpenAPI doc for
// the publish wizard. Auth-gated, stateless (no apiId yet). Returns metadata.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { raw?: string; url?: string } = {};
  try {
    body = (await req.json()) as { raw?: string; url?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let raw = typeof body.raw === "string" ? body.raw : "";
  if (body.url) {
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

  const { title, openapiVersion, opCount, format } = result.value;
  return NextResponse.json({ data: { title, openapiVersion, opCount, format } });
}
