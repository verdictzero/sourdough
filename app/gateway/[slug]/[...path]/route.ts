import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Plan } from "@/lib/db/types";

export const dynamic = "force-dynamic";

// The API gateway. Consumers call:
//   /gateway/<api-slug>/<upstream-path>?...   with  Authorization: Bearer <key>
// We authenticate the key, enforce the plan's rate limit + monthly quota,
// proxy to the API's base_url, meter the call, and return the upstream response.

type Ctx = { params: Promise<{ slug: string; path?: string[] }> };

function bearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key");
}

function buildTarget(baseUrl: string, segments: string[], search: string, origin: string): string {
  const sub = segments.length ? "/" + segments.join("/") : "";
  const base = baseUrl.replace(/\/$/, "");
  const abs = /^https?:\/\//i.test(base) ? base : origin + base;
  return abs + sub + search;
}

function rateHeaders(plan: Plan | null, usedThisMin: number): Record<string, string> {
  if (!plan?.rateLimitPerMin) return {};
  return {
    "X-RateLimit-Limit": String(plan.rateLimitPerMin),
    "X-RateLimit-Remaining": String(Math.max(0, plan.rateLimitPerMin - usedThisMin)),
  };
}

async function handle(req: Request, { params }: Ctx) {
  const { slug, path = [] } = await params;
  const db = getDb();

  // 1. Authenticate the key.
  const token = bearer(req);
  if (!token) {
    return NextResponse.json(
      { error: "Missing API key. Send 'Authorization: Bearer <key>'." },
      { status: 401 },
    );
  }
  const resolved = await db.apiKeys.resolve(token);
  if (!resolved) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  const { key, subscription } = resolved;

  // 2. Check the subscription + that the key matches this API.
  if (subscription.status !== "active") {
    return NextResponse.json({ error: "Subscription is not active" }, { status: 403 });
  }
  const api = await db.apis.getBySlug(slug);
  if (!api || api.id !== subscription.apiId) {
    return NextResponse.json(
      { error: "This key is not valid for this API" },
      { status: 403 },
    );
  }

  // 3. Enforce plan limits.
  const plan = subscription.planId ? await db.plans.getById(subscription.planId) : null;
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const usedThisMin = await db.usage.countSince(subscription.id, minuteAgo);

  if (plan?.rateLimitPerMin != null && usedThisMin >= plan.rateLimitPerMin) {
    return NextResponse.json(
      { error: "Rate limit exceeded", limitPerMinute: plan.rateLimitPerMin },
      { status: 429, headers: { "Retry-After": "60", ...rateHeaders(plan, usedThisMin) } },
    );
  }
  if (plan?.quotaMonth != null) {
    const usedThisMonth = await db.usage.countThisMonth(subscription.id);
    if (usedThisMonth >= plan.quotaMonth) {
      return NextResponse.json(
        { error: "Monthly quota exceeded", quotaMonth: plan.quotaMonth },
        { status: 429 },
      );
    }
  }

  // 4. Proxy to the upstream.
  const reqUrl = new URL(req.url);
  const target = buildTarget(api.baseUrl, path, reqUrl.search, reqUrl.origin);

  const fwdHeaders = new Headers(req.headers);
  fwdHeaders.delete("authorization");
  fwdHeaders.delete("x-api-key");
  fwdHeaders.delete("host");
  fwdHeaders.delete("content-length");

  const init: RequestInit = { method: req.method, headers: fwdHeaders };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  const started = Date.now();
  let status = 502;
  let responseBody: ArrayBuffer | null = null;
  let responseHeaders = new Headers();
  let networkError = false;

  try {
    const upstream = await fetch(target, init);
    status = upstream.status;
    responseBody = await upstream.arrayBuffer();
    responseHeaders = new Headers(upstream.headers);
    // fetch already decodes the body; drop stale encoding/length headers.
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.delete("transfer-encoding");
  } catch {
    networkError = true;
  }
  const latencyMs = Date.now() - started;

  // 5. Meter the call (always, so usage reflects real traffic).
  await db.usage.record({
    apiKeyId: key.id,
    subscriptionId: subscription.id,
    apiId: api.id,
    method: req.method,
    path: "/" + path.join("/"),
    statusCode: networkError ? 502 : status,
    latencyMs,
  });
  await db.apiKeys.touch(key.id);

  const extra = { ...rateHeaders(plan, usedThisMin + 1), "X-Sourdough-Upstream": api.baseUrl };

  if (networkError) {
    return NextResponse.json(
      { error: "Upstream request failed", target },
      { status: 502, headers: extra },
    );
  }

  for (const [k, v] of Object.entries(extra)) responseHeaders.set(k, v);
  return new NextResponse(responseBody, { status, headers: responseHeaders });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
