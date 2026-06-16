// Domain model + storage contracts for Sourdough.
//
// Everything the app touches goes through these interfaces. The concrete store
// (SQLite today, Postgres tomorrow) lives behind them. Repository methods are
// async on purpose: node:sqlite is synchronous, but a real driver (pg) is not —
// returning Promises now means call sites don't change when the store does.

export type Pricing = "free" | "freemium" | "paid";
export type ApiStatus = "draft" | "published";
export type SubscriptionStatus = "active" | "revoked";
export type UserRole = "user" | "admin";

// --- users & sessions --------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

/** Internal shape including the password hash — never sent to clients. */
export interface UserWithSecret extends User {
  passwordHash: string;
}

export interface Session {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

// --- API listings & plans ----------------------------------------------------

export interface ApiListing {
  id: string;
  slug: string;
  ownerId: string | null;
  name: string;
  tagline: string;
  description: string;
  category: string;
  provider: string;
  baseUrl: string;
  version: string;
  pricing: Pricing;
  priceNote: string | null;
  tags: string[];
  status: ApiStatus;
  createdAt: string;
  updatedAt: string;
}

/** A pricing/access tier for an API, carrying the limits the gateway enforces. */
export interface Plan {
  id: string;
  apiId: string;
  name: string;
  priceCents: number;
  /** "month" for recurring, null for free/one-off. */
  interval: string | null;
  /** Calls per calendar month; null = unlimited. */
  quotaMonth: number | null;
  /** Requests per minute; null = unlimited. */
  rateLimitPerMin: number | null;
  sort: number;
  createdAt: string;
}

export interface NewApiListing {
  ownerId: string | null;
  name: string;
  provider: string;
  baseUrl: string;
  tagline?: string;
  description?: string;
  category?: string;
  version?: string;
  pricing?: Pricing;
  priceNote?: string | null;
  tags?: string[];
  status?: ApiStatus;
}

export type ApiPatch = Partial<Omit<NewApiListing, "ownerId">>;

export interface NewPlan {
  name: string;
  priceCents?: number;
  interval?: string | null;
  quotaMonth?: number | null;
  rateLimitPerMin?: number | null;
  sort?: number;
}

export interface ApiFilter {
  q?: string;
  category?: string;
  status?: ApiStatus;
  ownerId?: string;
}

export interface ApiWithPlans extends ApiListing {
  plans: Plan[];
}

// --- subscriptions & keys ----------------------------------------------------

export interface Subscription {
  id: string;
  apiId: string;
  planId: string | null;
  userId: string;
  status: SubscriptionStatus;
  createdAt: string;
}

/** Stored key — only the hash and a display prefix, never the plaintext. */
export interface ApiKey {
  id: string;
  subscriptionId: string;
  keyPrefix: string;
  label: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

/** Returned once at creation time, with the plaintext key the caller must save. */
export interface ApiKeyWithSecret extends ApiKey {
  plaintext: string;
}

/** A subscription enriched for dashboards: its API, plan, keys, and usage. */
export interface SubscriptionDetail extends Subscription {
  api: ApiListing | null;
  plan: Plan | null;
  keys: ApiKey[];
  usageThisMonth: number;
}

// --- usage -------------------------------------------------------------------

export interface UsageEvent {
  id: string;
  apiKeyId: string | null;
  subscriptionId: string | null;
  apiId: string;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  createdAt: string;
}

export interface NewUsageEvent {
  apiKeyId: string | null;
  subscriptionId: string | null;
  apiId: string;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
}

// --- repository contracts ----------------------------------------------------

export interface UserRepository {
  create(input: {
    email: string;
    name: string;
    passwordHash: string;
    role?: UserRole;
  }): Promise<User>;
  getById(id: string): Promise<User | null>;
  getByEmail(email: string): Promise<UserWithSecret | null>;
}

export interface SessionRepository {
  create(userId: string, ttlMs: number): Promise<Session>;
  getValid(token: string): Promise<Session | null>;
  delete(token: string): Promise<void>;
}

export interface ApiRepository {
  list(filter?: ApiFilter): Promise<ApiListing[]>;
  getById(id: string): Promise<ApiListing | null>;
  getBySlug(slug: string): Promise<ApiListing | null>;
  getWithPlans(slug: string): Promise<ApiWithPlans | null>;
  create(input: NewApiListing, plans: NewPlan[]): Promise<ApiWithPlans>;
  update(id: string, patch: ApiPatch): Promise<ApiListing | null>;
  remove(id: string): Promise<boolean>;
  categories(): Promise<string[]>;
}

export interface PlanRepository {
  listByApi(apiId: string): Promise<Plan[]>;
  getById(id: string): Promise<Plan | null>;
}

export interface SubscriptionRepository {
  getById(id: string): Promise<Subscription | null>;
  getActive(userId: string, apiId: string): Promise<Subscription | null>;
  listForUser(userId: string): Promise<SubscriptionDetail[]>;
  create(input: {
    apiId: string;
    planId: string | null;
    userId: string;
  }): Promise<Subscription>;
  revoke(id: string): Promise<Subscription | null>;
}

export interface ApiKeyRepository {
  create(subscriptionId: string, label?: string): Promise<ApiKeyWithSecret>;
  listBySubscription(subscriptionId: string): Promise<ApiKey[]>;
  /** Resolve an active key by plaintext, joined with its subscription. */
  resolve(plaintext: string): Promise<{ key: ApiKey; subscription: Subscription } | null>;
  touch(id: string): Promise<void>;
  revoke(id: string): Promise<ApiKey | null>;
}

export interface UsageRepository {
  record(event: NewUsageEvent): Promise<void>;
  countSince(subscriptionId: string, sinceIso: string): Promise<number>;
  countThisMonth(subscriptionId: string): Promise<number>;
  recentForUser(userId: string, limit: number): Promise<UsageEvent[]>;
}

export interface Repositories {
  users: UserRepository;
  sessions: SessionRepository;
  apis: ApiRepository;
  plans: PlanRepository;
  subscriptions: SubscriptionRepository;
  apiKeys: ApiKeyRepository;
  usage: UsageRepository;
}
