// Lightweight request validation. No schema library — just enough to keep the
// API routes honest. If this grows, swap in zod behind the same return shape.

import type {
  ApiPatch,
  ApiStatus,
  NewApiListing,
  NewPlan,
  Pricing,
} from "./db/types";

const PRICING: Pricing[] = ["free", "freemium", "paid"];
const STATUS: ApiStatus[] = ["draft", "published"];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

type Body = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function asTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).filter(Boolean);
  if (typeof v === "string")
    return v.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
}

// --- auth --------------------------------------------------------------------

export function validateSignup(
  body: unknown,
): Validated<{ email: string; name: string; password: string }> {
  const b = (body ?? {}) as Body;
  const errors: string[] = [];
  const email = str(b.email).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  if (!EMAIL_RE.test(email)) errors.push("a valid email is required");
  if (password.length < 8) errors.push("password must be at least 8 characters");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { email, password, name: str(b.name) || email.split("@")[0] },
  };
}

export function validateLogin(
  body: unknown,
): Validated<{ email: string; password: string }> {
  const b = (body ?? {}) as Body;
  const email = str(b.email).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  if (!email || !password)
    return { ok: false, errors: ["email and password are required"] };
  return { ok: true, value: { email, password } };
}

// --- API listings ------------------------------------------------------------

export function validateNewApi(
  body: unknown,
): Validated<Omit<NewApiListing, "ownerId">> {
  const b = (body ?? {}) as Body;
  const errors: string[] = [];

  const name = str(b.name);
  if (!name) errors.push("name is required");
  const provider = str(b.provider);
  if (!provider) errors.push("provider is required");
  // baseUrl is optional: an empty value marks a catalog/docs-only API with no
  // live endpoint. When provided, it must still look like a URL or relative path.
  const baseUrl = str(b.baseUrl);
  if (baseUrl && !/^(https?:\/\/|\/)/i.test(baseUrl))
    errors.push("baseUrl must start with http(s):// or / (for a relative path)");

  const pricing = (str(b.pricing) || "free") as Pricing;
  if (!PRICING.includes(pricing))
    errors.push(`pricing must be one of: ${PRICING.join(", ")}`);
  const status = (str(b.status) || "published") as ApiStatus;
  if (!STATUS.includes(status))
    errors.push(`status must be one of: ${STATUS.join(", ")}`);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      provider,
      baseUrl,
      tagline: str(b.tagline),
      description: str(b.description),
      category: str(b.category) || "General",
      version: str(b.version) || "v1",
      pricing,
      priceNote: str(b.priceNote) || null,
      tags: asTags(b.tags),
      status,
    },
  };
}

/**
 * Parse plan definitions from a publish body. Accepts either a `plans` array or
 * a single flat `plan` object; falls back to one sensible Free plan.
 */
export function parsePlans(body: unknown): NewPlan[] {
  const b = (body ?? {}) as Body;
  const raw = Array.isArray(b.plans)
    ? (b.plans as unknown[])
    : b.plan
      ? [b.plan]
      : [];
  const plans: NewPlan[] = [];
  raw.forEach((p, i) => {
    const o = (p ?? {}) as Body;
    const name = str(o.name);
    if (!name) return;
    plans.push({
      name,
      priceCents: intOrNull(o.priceCents) ?? 0,
      interval: str(o.interval) || null,
      quotaMonth: intOrNull(o.quotaMonth),
      rateLimitPerMin: intOrNull(o.rateLimitPerMin),
      sort: i,
    });
  });

  if (plans.length === 0) {
    plans.push({
      name: "Free",
      priceCents: 0,
      quotaMonth: 10000,
      rateLimitPerMin: 60,
      sort: 0,
    });
  }
  return plans;
}

export function pickApiPatch(body: unknown): Validated<ApiPatch> {
  const b = (body ?? {}) as Body;
  const patch: ApiPatch = {};
  const errors: string[] = [];

  if ("name" in b) {
    const name = str(b.name);
    if (!name) errors.push("name cannot be empty");
    else patch.name = name;
  }
  if ("provider" in b) patch.provider = str(b.provider);
  if ("baseUrl" in b) {
    const baseUrl = str(b.baseUrl);
    if (baseUrl && !/^(https?:\/\/|\/)/i.test(baseUrl))
      errors.push("baseUrl must start with http(s):// or /");
    else patch.baseUrl = baseUrl;
  }
  if ("tagline" in b) patch.tagline = str(b.tagline);
  if ("description" in b) patch.description = str(b.description);
  if ("category" in b) patch.category = str(b.category) || "General";
  if ("version" in b) patch.version = str(b.version) || "v1";
  if ("pricing" in b) {
    const pricing = str(b.pricing) as Pricing;
    if (!PRICING.includes(pricing))
      errors.push(`pricing must be one of: ${PRICING.join(", ")}`);
    else patch.pricing = pricing;
  }
  if ("priceNote" in b) patch.priceNote = str(b.priceNote) || null;
  if ("tags" in b) patch.tags = asTags(b.tags);
  if ("status" in b) {
    const status = str(b.status) as ApiStatus;
    if (!STATUS.includes(status))
      errors.push(`status must be one of: ${STATUS.join(", ")}`);
    else patch.status = status;
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: patch };
}
