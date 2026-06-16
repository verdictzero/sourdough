import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// POST /api/apis/:slug/subscribe  — subscribe the signed-in user on a plan and
// mint the first API key. The plaintext key is returned ONCE here.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in to subscribe" },
      { status: 401 },
    );
  }

  const { slug } = await params;
  const db = getDb();
  const api = await db.apis.getBySlug(slug);
  if (!api) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { planId?: string } = {};
  try {
    body = (await req.json()) as { planId?: string };
  } catch {
    /* body optional */
  }

  const plans = await db.plans.listByApi(api.id);
  let planId: string | null = null;
  if (body.planId) {
    const chosen = plans.find((p) => p.id === body.planId);
    if (!chosen)
      return NextResponse.json(
        { error: "Unknown plan for this API" },
        { status: 400 },
      );
    planId = chosen.id;
  } else if (plans.length > 0) {
    planId = plans[0].id;
  }

  const subscription = await db.subscriptions.create({
    apiId: api.id,
    planId,
    userId: user.id,
  });
  const key = await db.apiKeys.create(subscription.id);

  return NextResponse.json(
    {
      data: {
        subscription,
        plan: planId ? plans.find((p) => p.id === planId) : null,
        apiKey: key.plaintext,
        keyPrefix: key.keyPrefix,
      },
    },
    { status: 201 },
  );
}
