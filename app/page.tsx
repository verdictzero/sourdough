import Link from "next/link";
import { getDb } from "@/lib/db";
import { ApiCard } from "@/components/ApiCard";

export const dynamic = "force-dynamic";

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q, category } = await searchParams;
  const db = getDb();
  const [apis, categories] = await Promise.all([
    db.apis.list({ q, category, status: "published" }),
    db.apis.categories(),
  ]);

  return (
    <>
      <section className="hero">
        <h1>Discover and ship with great APIs</h1>
        <p>
          Browse the Sourdough marketplace, grab an API key in one click, and
          start building. Publishing your own takes about a minute.
        </p>
      </section>

      <form className="filters" action="/" method="get">
        <input
          type="search"
          name="q"
          placeholder="Search APIs by name, tag, or description…"
          defaultValue={q ?? ""}
          aria-label="Search APIs"
        />
        <select
          name="category"
          defaultValue={category ?? ""}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="submit" className="btn">
          Search
        </button>
      </form>

      {(q || category) && (
        <div className="chips">
          <Link href="/" className="chip active">
            Clear filters ✕
          </Link>
          {category && <span className="chip">Category: {category}</span>}
          {q && <span className="chip">“{q}”</span>}
        </div>
      )}

      {apis.length === 0 ? (
        <div className="empty">
          <p>No APIs match your search.</p>
          <Link href="/" className="back-link">
            ← Back to all APIs
          </Link>
        </div>
      ) : (
        <div className="grid">
          {apis.map((api) => (
            <ApiCard key={api.id} api={api} />
          ))}
        </div>
      )}
    </>
  );
}
