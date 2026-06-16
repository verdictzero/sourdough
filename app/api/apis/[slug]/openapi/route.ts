import { NextResponse } from "next/server";
import { stringify as stringifyYaml } from "yaml";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// GET /api/apis/:slug/openapi  — public export of the stored spec.
//   ?format=yaml   serialize as YAML
//   ?download=1    force a file download
export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const db = getDb();
  const api = await db.apis.getBySlug(slug);
  if (!api) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const spec = await db.specs.getByApiId(api.id);
  if (!spec) {
    return NextResponse.json({ error: "No spec for this API" }, { status: 404 });
  }

  const url = new URL(req.url);
  const wantYaml = url.searchParams.get("format") === "yaml";
  const download = url.searchParams.get("download") === "1";

  const doc = JSON.parse(spec.doc);
  const body = wantYaml ? stringifyYaml(doc) : JSON.stringify(doc, null, 2);

  const headers: Record<string, string> = {
    "Content-Type": wantYaml
      ? "application/yaml; charset=utf-8"
      : "application/json; charset=utf-8",
  };
  if (download) {
    headers["Content-Disposition"] =
      `attachment; filename="${slug}-openapi.${wantYaml ? "yaml" : "json"}"`;
  }
  return new NextResponse(body, { status: 200, headers });
}
