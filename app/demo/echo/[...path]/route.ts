import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// A tiny real upstream so the gateway has something live to forward to.
// Echoes the request back as JSON. Reached via the seeded "Echo" API
// (base_url "/demo/echo") through /gateway/echo/...
type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  const url = new URL(req.url);

  let body: unknown = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const text = await req.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
  }

  return NextResponse.json({
    service: "echo",
    method: req.method,
    path: "/" + (path ?? []).join("/"),
    query: Object.fromEntries(url.searchParams),
    userAgent: req.headers.get("user-agent"),
    body,
    receivedAt: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
