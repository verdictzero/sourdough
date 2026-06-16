import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { SubscriptionCard } from "@/components/dashboard/SubscriptionCard";
import { OwnedApiRow } from "@/components/dashboard/OwnedApiRow";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  const db = getDb();
  const [subs, owned, recent] = await Promise.all([
    db.subscriptions.listForUser(user.id),
    db.apis.list({ ownerId: user.id }),
    db.usage.recentForUser(user.id, 12),
  ]);

  return (
    <>
      <h1>Dashboard</h1>
      <p className="muted">Signed in as {user.email}</p>

      <section style={{ marginTop: 28 }}>
        <h2>Your subscriptions</h2>
        {subs.length === 0 ? (
          <div className="empty">
            <p>You haven&apos;t subscribed to any APIs yet.</p>
            <Link href="/" className="back-link">← Browse the marketplace</Link>
          </div>
        ) : (
          <div className="dash-grid">
            {subs.map((s) => (
              <SubscriptionCard
                key={s.id}
                sub={{
                  id: s.id,
                  status: s.status,
                  usageThisMonth: s.usageThisMonth,
                  api: s.api ? { slug: s.api.slug, name: s.api.name } : null,
                  plan: s.plan
                    ? {
                        name: s.plan.name,
                        quotaMonth: s.plan.quotaMonth,
                        rateLimitPerMin: s.plan.rateLimitPerMin,
                      }
                    : null,
                  keys: s.keys.map((k) => ({
                    id: k.id,
                    keyPrefix: k.keyPrefix,
                    label: k.label,
                    lastUsedAt: k.lastUsedAt,
                    revokedAt: k.revokedAt,
                  })),
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 36 }}>
        <div className="card-head" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Your APIs</h2>
          <Link href="/publish" className="btn secondary">+ Publish</Link>
        </div>
        {owned.length === 0 ? (
          <p className="muted">You haven&apos;t published any APIs yet.</p>
        ) : (
          owned.map((a) => (
            <OwnedApiRow key={a.id} slug={a.slug} name={a.name} status={a.status} />
          ))
        )}
      </section>

      <section style={{ marginTop: 36 }}>
        <h2>Recent gateway activity</h2>
        {recent.length === 0 ? (
          <p className="muted">
            No calls yet. Subscribe to an API and call it through{" "}
            <code className="inline">/gateway/&lt;slug&gt;</code>.
          </p>
        ) : (
          <table className="usage-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Method</th>
                <th>Path</th>
                <th>Status</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.createdAt).toLocaleTimeString()}</td>
                  <td>{e.method}</td>
                  <td><code className="inline">{e.path}</code></td>
                  <td>
                    <span className={e.statusCode < 400 ? "ok-text" : "err-text"}>
                      {e.statusCode}
                    </span>
                  </td>
                  <td>{e.latencyMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
