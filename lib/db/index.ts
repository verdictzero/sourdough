// Storage factory + singleton.
//
// Everything in the app imports `getDb()` from here and never names a concrete
// store. Selecting an engine is one switch statement; adding Postgres later is
// a new case, not a refactor.
//
// The instance is cached on globalThis so Next.js dev hot-reloads reuse one
// open database handle instead of leaking a new one on every change.

import { createSqliteRepositories } from "./sqlite";
import type { Repositories } from "./types";

const globalForDb = globalThis as unknown as {
  __sourdoughDb?: Repositories;
};

function createRepositories(): Repositories {
  const driver = process.env.DB_DRIVER ?? "sqlite";
  switch (driver) {
    case "sqlite": {
      const path = process.env.DATABASE_PATH ?? "data/sourdough.db";
      return createSqliteRepositories(path);
    }
    // case "postgres":
    //   return createPgRepositories(process.env.DATABASE_URL!);
    default:
      throw new Error(`Unknown DB_DRIVER: ${driver}`);
  }
}

export function getDb(): Repositories {
  if (!globalForDb.__sourdoughDb) {
    globalForDb.__sourdoughDb = createRepositories();
  }
  return globalForDb.__sourdoughDb;
}
