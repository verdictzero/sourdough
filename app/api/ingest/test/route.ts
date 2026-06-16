import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// POST /api/ingest/test  { baseUrl }  — server-side reachability check used by
// the publish wizard. Auth-gated (only signed-in providers register upstreams).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let baseUrl = "";
  try {
    baseUrl = String(((await req.json()) as { baseUrl?: string }).baseUrl ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!/^(https?:\/\/|\/)/i.test(baseUrl)) {
    return NextResponse.json(
      { ok: false, error: "Base URL must start with http(s):// or /" },
      { status: 400 },
    );
  }

  // Resolve relative upstreams (e.g. the built-in /demo/echo) against this host.
  const target = baseUrl.startsWith("/")
    ? new URL(req.url).origin + baseUrl.replace(/\/$/, "")
    : baseUrl;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const started = Date.now();
  try {
    const res = await fetch(target, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    return NextResponse.json({
      ok: true,
      reachable: true,
      status: res.status,
      statusText: res.statusText,
      latencyMs: Date.now() - started,
      target,
    });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? "Timed out after 5s"
        : "Could not connect";
    return NextResponse.json({ ok: false, reachable: false, error: reason, target });
  } finally {
    clearTimeout(timer);
  }
}
