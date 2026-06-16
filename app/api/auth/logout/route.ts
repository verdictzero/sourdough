import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// POST /api/auth/logout  — clear the session.
export async function POST() {
  await endSession();
  return NextResponse.json({ data: { ok: true } });
}
