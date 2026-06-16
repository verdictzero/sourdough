// Versioned, forward-only migrations.
//
// Each migration has a stable numeric id and an `up` that runs once, inside a
// transaction, tracked in the `_migrations` table. To evolve the schema, append
// a new entry — never edit an applied one. This replaces "CREATE TABLE IF NOT
// EXISTS" sprinkled through the data layer with a real, ordered history.

import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  id: number;
  name: string;
  up: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "init",
    up: `
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        name          TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'user',
        created_at    TEXT NOT NULL
      );

      CREATE TABLE sessions (
        token      TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);

      CREATE TABLE apis (
        id          TEXT PRIMARY KEY,
        slug        TEXT NOT NULL UNIQUE,
        owner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
        name        TEXT NOT NULL,
        tagline     TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        category    TEXT NOT NULL DEFAULT 'General',
        provider    TEXT NOT NULL DEFAULT '',
        base_url    TEXT NOT NULL DEFAULT '',
        version     TEXT NOT NULL DEFAULT 'v1',
        pricing     TEXT NOT NULL DEFAULT 'free',
        price_note  TEXT,
        tags        TEXT NOT NULL DEFAULT '[]',
        status      TEXT NOT NULL DEFAULT 'published',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX idx_apis_status ON apis(status);
      CREATE INDEX idx_apis_owner  ON apis(owner_id);

      CREATE TABLE plans (
        id                 TEXT PRIMARY KEY,
        api_id             TEXT NOT NULL REFERENCES apis(id) ON DELETE CASCADE,
        name               TEXT NOT NULL,
        price_cents        INTEGER NOT NULL DEFAULT 0,
        interval           TEXT,
        quota_month        INTEGER,
        rate_limit_per_min INTEGER,
        sort               INTEGER NOT NULL DEFAULT 0,
        created_at         TEXT NOT NULL
      );
      CREATE INDEX idx_plans_api ON plans(api_id);

      CREATE TABLE subscriptions (
        id         TEXT PRIMARY KEY,
        api_id     TEXT NOT NULL REFERENCES apis(id) ON DELETE CASCADE,
        plan_id    TEXT REFERENCES plans(id) ON DELETE SET NULL,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status     TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        UNIQUE(api_id, user_id)
      );
      CREATE INDEX idx_subs_user ON subscriptions(user_id);
      CREATE INDEX idx_subs_api  ON subscriptions(api_id);

      CREATE TABLE api_keys (
        id              TEXT PRIMARY KEY,
        subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
        key_prefix      TEXT NOT NULL,
        key_hash        TEXT NOT NULL UNIQUE,
        label           TEXT NOT NULL DEFAULT 'default',
        last_used_at    TEXT,
        created_at      TEXT NOT NULL,
        revoked_at      TEXT
      );
      CREATE INDEX idx_keys_sub ON api_keys(subscription_id);

      CREATE TABLE usage_events (
        id              TEXT PRIMARY KEY,
        api_key_id      TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
        subscription_id TEXT REFERENCES subscriptions(id) ON DELETE CASCADE,
        api_id          TEXT NOT NULL,
        method          TEXT NOT NULL,
        path            TEXT NOT NULL,
        status_code     INTEGER NOT NULL,
        latency_ms      INTEGER NOT NULL,
        created_at      TEXT NOT NULL
      );
      CREATE INDEX idx_usage_sub  ON usage_events(subscription_id, created_at);
      CREATE INDEX idx_usage_api  ON usage_events(api_id, created_at);
    `,
  },
  {
    id: 2,
    name: "api_specs",
    up: `
      CREATE TABLE api_specs (
        id              TEXT PRIMARY KEY,
        api_id          TEXT NOT NULL UNIQUE REFERENCES apis(id) ON DELETE CASCADE,
        format          TEXT NOT NULL DEFAULT 'json',
        source          TEXT NOT NULL DEFAULT 'paste',
        source_url      TEXT,
        doc             TEXT NOT NULL,
        title           TEXT NOT NULL DEFAULT '',
        openapi_version TEXT NOT NULL DEFAULT '',
        op_count        INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );
      CREATE INDEX idx_api_specs_api ON api_specs(api_id);
    `,
  },
];

export function runMigrations(db: DatabaseSync): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       id INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at TEXT NOT NULL
     );`,
  );

  const applied = new Set(
    (db.prepare("SELECT id FROM _migrations").all() as { id: number }[]).map(
      (r) => r.id,
    ),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.up);
      // node:sqlite has no bound-param timestamp helper here; ISO string is fine.
      db.prepare(
        "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)",
      ).run(migration.id, migration.name, new Date().toISOString());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
