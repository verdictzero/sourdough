// SQLite-backed implementation of the repository contracts.
//
// Uses Node's built-in `node:sqlite` (Node 22.5+) — zero npm dependencies and
// no native compile step. To move to Postgres later, write a
// `createPgRepositories` returning the same `Repositories` shape and wire it
// into ./index.ts. Schema lives in ./migrations.ts.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import {
  generateApiKey,
  hashKey,
  keyPrefix,
  newId,
  slugify,
} from "../ids";
import { hashPassword } from "../auth/password";
import { runMigrations } from "./migrations";
import type {
  ApiKey,
  ApiKeyRepository,
  ApiKeyWithSecret,
  ApiListing,
  ApiPatch,
  ApiRepository,
  ApiSpec,
  ApiWithPlans,
  NewApiListing,
  NewApiSpec,
  NewPlan,
  NewUsageEvent,
  SpecRepository,
  Plan,
  PlanRepository,
  Repositories,
  Session,
  SessionRepository,
  Subscription,
  SubscriptionDetail,
  SubscriptionRepository,
  UsageEvent,
  UsageRepository,
  User,
  UserRepository,
  UserWithSecret,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function monthStartIso(): string {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)).toISOString();
}

function safeJsonArray(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

// --- row mappers (snake_case columns -> camelCase domain) --------------------
/* eslint-disable @typescript-eslint/no-explicit-any */

function mapUser(r: any): User {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    createdAt: r.created_at,
  };
}

function mapUserSecret(r: any): UserWithSecret {
  return { ...mapUser(r), passwordHash: r.password_hash };
}

function mapSession(r: any): Session {
  return {
    token: r.token,
    userId: r.user_id,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  };
}

function mapApi(r: any): ApiListing {
  return {
    id: r.id,
    slug: r.slug,
    ownerId: r.owner_id ?? null,
    name: r.name,
    tagline: r.tagline,
    description: r.description,
    category: r.category,
    provider: r.provider,
    baseUrl: r.base_url,
    version: r.version,
    pricing: r.pricing,
    priceNote: r.price_note ?? null,
    tags: safeJsonArray(r.tags),
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapPlan(r: any): Plan {
  return {
    id: r.id,
    apiId: r.api_id,
    name: r.name,
    priceCents: r.price_cents,
    interval: r.interval ?? null,
    quotaMonth: r.quota_month ?? null,
    rateLimitPerMin: r.rate_limit_per_min ?? null,
    sort: r.sort,
    createdAt: r.created_at,
  };
}

function mapSub(r: any): Subscription {
  return {
    id: r.id,
    apiId: r.api_id,
    planId: r.plan_id ?? null,
    userId: r.user_id,
    status: r.status,
    createdAt: r.created_at,
  };
}

function mapKey(r: any): ApiKey {
  return {
    id: r.id,
    subscriptionId: r.subscription_id,
    keyPrefix: r.key_prefix,
    label: r.label,
    lastUsedAt: r.last_used_at ?? null,
    createdAt: r.created_at,
    revokedAt: r.revoked_at ?? null,
  };
}

function mapUsage(r: any): UsageEvent {
  return {
    id: r.id,
    apiKeyId: r.api_key_id ?? null,
    subscriptionId: r.subscription_id ?? null,
    apiId: r.api_id,
    method: r.method,
    path: r.path,
    statusCode: r.status_code,
    latencyMs: r.latency_ms,
    createdAt: r.created_at,
  };
}

function mapApiSpec(r: any): ApiSpec {
  return {
    id: r.id,
    apiId: r.api_id,
    format: r.format,
    source: r.source,
    sourceUrl: r.source_url ?? null,
    doc: r.doc,
    title: r.title,
    openapiVersion: r.openapi_version,
    opCount: r.op_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// --- repositories ------------------------------------------------------------

function createUserRepository(db: DatabaseSync): UserRepository {
  const getById = async (id: string) => {
    const r = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    return r ? mapUser(r) : null;
  };
  return {
    getById,
    async create({ email, name, passwordHash, role = "user" }) {
      const id = newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO users (id, email, name, password_hash, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, email.toLowerCase(), name, passwordHash, role, ts);
      return (await getById(id))!;
    },
    async getByEmail(email) {
      const r = db
        .prepare("SELECT * FROM users WHERE email = ?")
        .get(email.toLowerCase());
      return r ? mapUserSecret(r) : null;
    },
  };
}

function createSessionRepository(db: DatabaseSync): SessionRepository {
  return {
    async create(userId, ttlMs) {
      const token = randomBytes(32).toString("hex");
      const created = new Date();
      const expires = new Date(created.getTime() + ttlMs);
      db.prepare(
        `INSERT INTO sessions (token, user_id, created_at, expires_at)
         VALUES (?, ?, ?, ?)`,
      ).run(token, userId, created.toISOString(), expires.toISOString());
      return {
        token,
        userId,
        createdAt: created.toISOString(),
        expiresAt: expires.toISOString(),
      };
    },
    async getValid(token) {
      const r = db
        .prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > ?")
        .get(token, nowIso());
      return r ? mapSession(r) : null;
    },
    async delete(token) {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    },
  };
}

function createApiRepository(db: DatabaseSync): ApiRepository {
  const getById = async (id: string) => {
    const r = db.prepare("SELECT * FROM apis WHERE id = ?").get(id);
    return r ? mapApi(r) : null;
  };
  const getBySlug = async (slug: string) => {
    const r = db.prepare("SELECT * FROM apis WHERE slug = ?").get(slug);
    return r ? mapApi(r) : null;
  };
  const plansFor = (apiId: string): Plan[] =>
    (
      db
        .prepare("SELECT * FROM plans WHERE api_id = ? ORDER BY sort, price_cents")
        .all(apiId) as unknown[]
    ).map(mapPlan);

  const uniqueSlug = (name: string): string => {
    const base = slugify(name);
    let candidate = base;
    let n = 1;
    while (db.prepare("SELECT 1 FROM apis WHERE slug = ?").get(candidate)) {
      candidate = `${base}-${++n}`;
    }
    return candidate;
  };

  return {
    getById,
    getBySlug,

    async list(filter = {}) {
      const where: string[] = [];
      const params: string[] = [];
      if (filter.status) {
        where.push("status = ?");
        params.push(filter.status);
      }
      if (filter.category) {
        where.push("category = ?");
        params.push(filter.category);
      }
      if (filter.ownerId) {
        where.push("owner_id = ?");
        params.push(filter.ownerId);
      }
      if (filter.q) {
        where.push(
          "(lower(name) LIKE ? OR lower(tagline) LIKE ? OR lower(description) LIKE ? OR lower(tags) LIKE ?)",
        );
        const like = `%${filter.q.toLowerCase()}%`;
        params.push(like, like, like, like);
      }
      const sql =
        "SELECT * FROM apis" +
        (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
        " ORDER BY datetime(created_at) DESC";
      return (db.prepare(sql).all(...params) as unknown[]).map(mapApi);
    },

    async getWithPlans(slug) {
      const api = await getBySlug(slug);
      if (!api) return null;
      const hasSpec = !!db
        .prepare("SELECT 1 FROM api_specs WHERE api_id = ?")
        .get(api.id);
      return { ...api, plans: plansFor(api.id), hasSpec } satisfies ApiWithPlans;
    },

    async create(input, plans) {
      const id = newId();
      const slug = uniqueSlug(input.name);
      const ts = nowIso();
      db.prepare(
        `INSERT INTO apis
          (id, slug, owner_id, name, tagline, description, category, provider,
           base_url, version, pricing, price_note, tags, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        slug,
        input.ownerId,
        input.name,
        input.tagline ?? "",
        input.description ?? "",
        input.category || "General",
        input.provider,
        input.baseUrl,
        input.version || "v1",
        input.pricing || "free",
        input.priceNote ?? null,
        JSON.stringify(input.tags ?? []),
        input.status || "published",
        ts,
        ts,
      );
      for (const [i, p] of plans.entries()) {
        insertPlan(db, id, p, i);
      }
      return { ...(await getById(id))!, plans: plansFor(id) };
    },

    async update(id, patch) {
      const existing = await getById(id);
      if (!existing) return null;
      const m = { ...existing, ...patch };
      db.prepare(
        `UPDATE apis SET
           name=?, tagline=?, description=?, category=?, provider=?, base_url=?,
           version=?, pricing=?, price_note=?, tags=?, status=?, updated_at=?
         WHERE id=?`,
      ).run(
        m.name,
        m.tagline,
        m.description,
        m.category,
        m.provider,
        m.baseUrl,
        m.version,
        m.pricing,
        m.priceNote ?? null,
        JSON.stringify(m.tags ?? []),
        m.status,
        nowIso(),
        id,
      );
      return getById(id);
    },

    async remove(id) {
      return db.prepare("DELETE FROM apis WHERE id = ?").run(id).changes > 0;
    },

    async categories() {
      return (
        db
          .prepare(
            "SELECT DISTINCT category FROM apis WHERE status='published' ORDER BY category",
          )
          .all() as { category: string }[]
      ).map((r) => r.category);
    },
  };
}

function insertPlan(
  db: DatabaseSync,
  apiId: string,
  p: NewPlan,
  defaultSort: number,
): void {
  db.prepare(
    `INSERT INTO plans
      (id, api_id, name, price_cents, interval, quota_month, rate_limit_per_min, sort, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    apiId,
    p.name,
    p.priceCents ?? 0,
    p.interval ?? null,
    p.quotaMonth ?? null,
    p.rateLimitPerMin ?? null,
    p.sort ?? defaultSort,
    nowIso(),
  );
}

function createPlanRepository(db: DatabaseSync): PlanRepository {
  return {
    async listByApi(apiId) {
      return (
        db
          .prepare("SELECT * FROM plans WHERE api_id = ? ORDER BY sort, price_cents")
          .all(apiId) as unknown[]
      ).map(mapPlan);
    },
    async getById(id) {
      const r = db.prepare("SELECT * FROM plans WHERE id = ?").get(id);
      return r ? mapPlan(r) : null;
    },
  };
}

function createSubscriptionRepository(db: DatabaseSync): SubscriptionRepository {
  const getById = async (id: string) => {
    const r = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(id);
    return r ? mapSub(r) : null;
  };
  return {
    getById,

    async getActive(userId, apiId) {
      const r = db
        .prepare(
          "SELECT * FROM subscriptions WHERE user_id = ? AND api_id = ? AND status = 'active'",
        )
        .get(userId, apiId);
      return r ? mapSub(r) : null;
    },

    async listForUser(userId) {
      const subs = (
        db
          .prepare(
            "SELECT * FROM subscriptions WHERE user_id = ? ORDER BY datetime(created_at) DESC",
          )
          .all(userId) as unknown[]
      ).map(mapSub);

      const out: SubscriptionDetail[] = [];
      const since = monthStartIso();
      for (const s of subs) {
        const apiRow = db.prepare("SELECT * FROM apis WHERE id = ?").get(s.apiId);
        const planRow = s.planId
          ? db.prepare("SELECT * FROM plans WHERE id = ?").get(s.planId)
          : null;
        const keys = (
          db
            .prepare(
              "SELECT * FROM api_keys WHERE subscription_id = ? ORDER BY datetime(created_at) DESC",
            )
            .all(s.id) as unknown[]
        ).map(mapKey);
        const { c } = db
          .prepare(
            "SELECT COUNT(*) AS c FROM usage_events WHERE subscription_id = ? AND created_at >= ?",
          )
          .get(s.id, since) as { c: number };
        out.push({
          ...s,
          api: apiRow ? mapApi(apiRow) : null,
          plan: planRow ? mapPlan(planRow) : null,
          keys,
          usageThisMonth: c,
        });
      }
      return out;
    },

    async create({ apiId, planId, userId }) {
      const existing = db
        .prepare("SELECT * FROM subscriptions WHERE user_id = ? AND api_id = ?")
        .get(userId, apiId);
      if (existing) {
        db.prepare(
          "UPDATE subscriptions SET status='active', plan_id=? WHERE id=?",
        ).run(planId, (existing as { id: string }).id);
        return (await getById((existing as { id: string }).id))!;
      }
      const id = newId();
      db.prepare(
        `INSERT INTO subscriptions (id, api_id, plan_id, user_id, status, created_at)
         VALUES (?, ?, ?, ?, 'active', ?)`,
      ).run(id, apiId, planId, userId, nowIso());
      return (await getById(id))!;
    },

    async revoke(id) {
      const r = db
        .prepare("UPDATE subscriptions SET status='revoked' WHERE id=?")
        .run(id);
      if (r.changes === 0) return null;
      db.prepare(
        "UPDATE api_keys SET revoked_at=? WHERE subscription_id=? AND revoked_at IS NULL",
      ).run(nowIso(), id);
      return getById(id);
    },
  };
}

function createApiKeyRepository(db: DatabaseSync): ApiKeyRepository {
  return {
    async create(subscriptionId, label = "default") {
      const plaintext = generateApiKey();
      const id = newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO api_keys
          (id, subscription_id, key_prefix, key_hash, label, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, subscriptionId, keyPrefix(plaintext), hashKey(plaintext), label, ts);
      return {
        id,
        subscriptionId,
        keyPrefix: keyPrefix(plaintext),
        label,
        lastUsedAt: null,
        createdAt: ts,
        revokedAt: null,
        plaintext,
      } satisfies ApiKeyWithSecret;
    },

    async listBySubscription(subscriptionId) {
      return (
        db
          .prepare(
            "SELECT * FROM api_keys WHERE subscription_id = ? ORDER BY datetime(created_at) DESC",
          )
          .all(subscriptionId) as unknown[]
      ).map(mapKey);
    },

    async resolve(plaintext) {
      const keyRow = db
        .prepare("SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
        .get(hashKey(plaintext));
      if (!keyRow) return null;
      const key = mapKey(keyRow);
      const subRow = db
        .prepare("SELECT * FROM subscriptions WHERE id = ?")
        .get(key.subscriptionId);
      if (!subRow) return null;
      return { key, subscription: mapSub(subRow) };
    },

    async touch(id) {
      db.prepare("UPDATE api_keys SET last_used_at=? WHERE id=?").run(
        nowIso(),
        id,
      );
    },

    async revoke(id) {
      const r = db
        .prepare("UPDATE api_keys SET revoked_at=? WHERE id=? AND revoked_at IS NULL")
        .run(nowIso(), id);
      if (r.changes === 0) return null;
      const row = db.prepare("SELECT * FROM api_keys WHERE id = ?").get(id);
      return row ? mapKey(row) : null;
    },
  };
}

function createSpecRepository(db: DatabaseSync): SpecRepository {
  return {
    async getByApiId(apiId) {
      const r = db.prepare("SELECT * FROM api_specs WHERE api_id = ?").get(apiId);
      return r ? mapApiSpec(r) : null;
    },

    async upsert(input: NewApiSpec) {
      const ts = nowIso();
      // ON CONFLICT(api_id) leaves created_at untouched (only set on insert).
      db.prepare(
        `INSERT INTO api_specs
          (id, api_id, format, source, source_url, doc, title, openapi_version, op_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(api_id) DO UPDATE SET
           format=excluded.format, source=excluded.source, source_url=excluded.source_url,
           doc=excluded.doc, title=excluded.title, openapi_version=excluded.openapi_version,
           op_count=excluded.op_count, updated_at=excluded.updated_at`,
      ).run(
        newId(),
        input.apiId,
        input.format,
        input.source,
        input.sourceUrl ?? null,
        input.doc,
        input.title,
        input.openapiVersion,
        input.opCount,
        ts,
        ts,
      );
      return (await this.getByApiId(input.apiId))!;
    },

    async remove(apiId) {
      return db.prepare("DELETE FROM api_specs WHERE api_id = ?").run(apiId).changes > 0;
    },
  };
}

function createUsageRepository(db: DatabaseSync): UsageRepository {
  return {
    async record(e: NewUsageEvent) {
      db.prepare(
        `INSERT INTO usage_events
          (id, api_key_id, subscription_id, api_id, method, path, status_code, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newId(),
        e.apiKeyId,
        e.subscriptionId,
        e.apiId,
        e.method,
        e.path,
        e.statusCode,
        e.latencyMs,
        nowIso(),
      );
    },
    async countSince(subscriptionId, sinceIso) {
      const { c } = db
        .prepare(
          "SELECT COUNT(*) AS c FROM usage_events WHERE subscription_id = ? AND created_at >= ?",
        )
        .get(subscriptionId, sinceIso) as { c: number };
      return c;
    },
    async countThisMonth(subscriptionId) {
      const { c } = db
        .prepare(
          "SELECT COUNT(*) AS c FROM usage_events WHERE subscription_id = ? AND created_at >= ?",
        )
        .get(subscriptionId, monthStartIso()) as { c: number };
      return c;
    },
    async recentForUser(userId, limit) {
      return (
        db
          .prepare(
            `SELECT u.* FROM usage_events u
             JOIN subscriptions s ON s.id = u.subscription_id
             WHERE s.user_id = ?
             ORDER BY datetime(u.created_at) DESC LIMIT ?`,
          )
          .all(userId, limit) as unknown[]
      ).map(mapUsage);
    },
  };
}

// --- factory + seed ----------------------------------------------------------

export function createSqliteRepositories(path: string): Repositories {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db);
  seedIfEmpty(db);

  return {
    users: createUserRepository(db),
    sessions: createSessionRepository(db),
    apis: createApiRepository(db),
    plans: createPlanRepository(db),
    subscriptions: createSubscriptionRepository(db),
    apiKeys: createApiKeyRepository(db),
    usage: createUsageRepository(db),
    specs: createSpecRepository(db),
  };
}

/** A starter provider account + example listings (incl. a working demo API). */
function seedIfEmpty(db: DatabaseSync): void {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM users").get() as {
    count: number;
  };
  if (count > 0) return;

  const ts = nowIso();
  const ownerId = newId();
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, 'admin', ?)`,
  ).run(
    ownerId,
    "demo@sourdough.dev",
    "Sourdough Demo",
    hashPassword("password"),
    ts,
  );

  for (const s of SEED) {
    const apiId = newId();
    db.prepare(
      `INSERT INTO apis
        (id, slug, owner_id, name, tagline, description, category, provider,
         base_url, version, pricing, price_note, tags, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`,
    ).run(
      apiId,
      s.slug,
      ownerId,
      s.name,
      s.tagline,
      s.description,
      s.category,
      s.provider,
      s.baseUrl,
      s.version,
      s.pricing,
      s.priceNote,
      JSON.stringify(s.tags),
      ts,
      ts,
    );
    s.plans.forEach((p, i) => insertPlan(db, apiId, p, i));
  }
}

interface SeedApi {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  provider: string;
  baseUrl: string;
  version: string;
  pricing: "free" | "freemium" | "paid";
  priceNote: string | null;
  tags: string[];
  plans: NewPlan[];
}

const FREE: NewPlan = {
  name: "Free",
  priceCents: 0,
  interval: null,
  quotaMonth: 10000,
  rateLimitPerMin: 60,
};

const SEED: SeedApi[] = [
  {
    slug: "echo",
    name: "Echo",
    tagline: "A live demo API hosted by Sourdough — try the gateway end to end.",
    description:
      "Echoes back your request (method, path, query, headers, body) as JSON. It actually runs, so you can subscribe, grab a key, and make real calls through the Sourdough gateway.",
    category: "Utilities",
    provider: "Sourdough",
    baseUrl: "/demo/echo",
    version: "v1",
    pricing: "free",
    priceNote: null,
    tags: ["demo", "testing", "utilities"],
    plans: [
      { name: "Free", priceCents: 0, quotaMonth: 5000, rateLimitPerMin: 30 },
    ],
  },
  {
    slug: "weather-oracle",
    name: "Weather Oracle",
    tagline: "Hyper-local forecasts and historical climate data.",
    description:
      "Current conditions, 14-day forecasts, and 40 years of historical climate data for any coordinate on Earth.",
    category: "Weather",
    provider: "Stratus Labs",
    baseUrl: "https://api.weatheroracle.io",
    version: "v2",
    pricing: "freemium",
    priceNote: "10k calls/mo free, then $0.50 per 1k",
    tags: ["weather", "forecast", "climate", "geo"],
    plans: [
      FREE,
      {
        name: "Pro",
        priceCents: 4900,
        interval: "month",
        quotaMonth: null,
        rateLimitPerMin: 600,
        sort: 1,
      },
    ],
  },
  {
    slug: "payflow",
    name: "PayFlow",
    tagline: "Accept payments and payouts in 40+ currencies.",
    description:
      "A unified payments API for charges, refunds, subscriptions, and payouts. PCI-DSS compliant with webhooks.",
    category: "Payments",
    provider: "PayFlow Inc.",
    baseUrl: "https://api.payflow.com",
    version: "v1",
    pricing: "paid",
    priceNote: "2.9% + $0.30 per transaction",
    tags: ["payments", "billing", "subscriptions", "fintech"],
    plans: [
      {
        name: "Starter",
        priceCents: 0,
        quotaMonth: 1000,
        rateLimitPerMin: 120,
      },
    ],
  },
  {
    slug: "lingua-translate",
    name: "LinguaTranslate",
    tagline: "Neural machine translation across 100+ languages.",
    description:
      "Translate text and documents with context-aware neural models. Supports glossaries and batch jobs.",
    category: "AI & ML",
    provider: "Polyglot Systems",
    baseUrl: "https://api.lingua.dev",
    version: "v3",
    pricing: "freemium",
    priceNote: "500k chars/mo free, then $15 per 1M chars",
    tags: ["translation", "nlp", "i18n", "ai"],
    plans: [FREE, { name: "Scale", priceCents: 1500, interval: "month", quotaMonth: null, rateLimitPerMin: 300, sort: 1 }],
  },
  {
    slug: "geopin",
    name: "GeoPin",
    tagline: "Forward and reverse geocoding with rooftop accuracy.",
    description:
      "Convert addresses to coordinates and back, with autocomplete, timezone lookup, and boundary data.",
    category: "Geolocation",
    provider: "Cartographe",
    baseUrl: "https://api.geopin.app",
    version: "v1",
    pricing: "freemium",
    priceNote: "2.5k calls/day free",
    tags: ["geocoding", "maps", "places", "geo"],
    plans: [FREE],
  },
  {
    slug: "sentiment-iq",
    name: "SentimentIQ",
    tagline: "Real-time sentiment and entity analysis for text.",
    description:
      "Classify sentiment, extract entities, and detect intent across documents and social streams.",
    category: "AI & ML",
    provider: "Cortex Analytics",
    baseUrl: "https://api.sentimentiq.ai",
    version: "v2",
    pricing: "paid",
    priceNote: "$0.001 per document",
    tags: ["nlp", "sentiment", "ai", "analytics"],
    plans: [{ name: "Pay-as-you-go", priceCents: 0, quotaMonth: 50000, rateLimitPerMin: 240 }],
  },
  {
    slug: "crypto-ticker",
    name: "CryptoTicker",
    tagline: "Live and historical prices for 8,000+ assets.",
    description:
      "Spot prices, OHLCV candles, and exchange order books with websocket streaming and historical backfill.",
    category: "Finance",
    provider: "Ledgerline",
    baseUrl: "https://api.cryptoticker.io",
    version: "v1",
    pricing: "free",
    priceNote: null,
    tags: ["crypto", "markets", "prices", "finance"],
    plans: [{ name: "Free", priceCents: 0, quotaMonth: null, rateLimitPerMin: 120 }],
  },
];
