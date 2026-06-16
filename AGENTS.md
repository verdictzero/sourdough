<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working in Sourdough

Sourdough is an API management platform / marketplace: providers publish APIs
with plans; consumers subscribe and get keys; all traffic flows through a
gateway that authenticates keys, enforces rate limits + quotas, meters usage,
and proxies to the upstream.

## Next.js 16 notes (things that already mattered here)

- Route Handler and Page `params` / `searchParams` are **Promises** — always `await` them.
- Reading `searchParams` (or dynamic params) opts a page into dynamic rendering.
- Cache Components is **not** enabled; classic `export const dynamic = "force-dynamic"` applies.

## Architecture

- **Storage is abstracted.** Everything calls `getDb()` from `lib/db/index.ts`,
  which returns repositories typed against `lib/db/types.ts`. Only
  `lib/db/sqlite.ts` knows SQL. To add Postgres, write a new factory returning
  the same `Repositories` shape and add a `case` in `index.ts` — do not leak a
  concrete store into routes or pages.
  Repos: `users · sessions · apis · plans · subscriptions · apiKeys · usage`.
- **Repository methods are async** even though `node:sqlite` is synchronous, so
  an async driver (pg) can drop in without changing call sites.
- **Schema is migrated, not ad-hoc.** Append a new entry to `MIGRATIONS` in
  `lib/db/migrations.ts`; never edit an applied one. Seeding is separate
  (`seedIfEmpty` in `sqlite.ts`).
- **Auth.** `lib/auth/session.ts` → `getCurrentUser()` (read; OK in Server
  Components) and `startSession`/`endSession` (write; Route Handlers only).
  Passwords are scrypt-hashed in `lib/auth/password.ts`.
- **The gateway** (`app/gateway/[slug]/[...path]`) is the only path consumers
  use at runtime. Keys are stored as SHA-256 hashes — never log or persist
  plaintext beyond the one-time reveal.
- **Reads vs. writes.** Server Components read directly via `getDb()`. Mutations
  go through the REST API in `app/api/` so there's a real API surface.
- `lib/db/*`, `lib/auth/*`, and the route handlers are **server-only** (they
  import `node:sqlite`). Never import them into a Client Component (`"use client"`).

## Conventions

- The data layer maps snake_case columns ↔ camelCase domain objects in
  `sqlite.ts`. Keep that mapping the single source of truth.
- Validation lives in `lib/validation.ts` and returns `{ ok, value | errors }`.
- API responses are `{ data }` on success, `{ error, details? }` on failure.
- The SQLite file is at `data/sourdough.db` (gitignored) and self-seeds when empty.
