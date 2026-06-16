import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { PricingBadge, StatusBadge } from "@/components/badges";
import { PlanList } from "@/components/PlanList";
import { SubscribePanel } from "./SubscribePanel";
import { SpecReference } from "./SpecReference";

export const dynamic = "force-dynamic";

export default async function ApiDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const api = await getDb().apis.getWithPlans(slug);
  if (!api) notFound();

  const user = await getCurrentUser();
  const isOwner = !!user && (user.role === "admin" || api.ownerId === user.id);

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const gatewayUrl = `${proto}://${host}/gateway/${api.slug}`;

  return (
    <>
      <Link href="/" className="back-link">
        ← Marketplace
      </Link>

      <div className="detail-head">
        <div>
          <h1 style={{ marginBottom: 4 }}>{api.name}</h1>
          <p className="muted" style={{ margin: 0, fontSize: "1.05rem" }}>
            {api.tagline}
          </p>
        </div>
      </div>

      <div className="detail-meta">
        <span className="badge">{api.category}</span>
        <PricingBadge pricing={api.pricing} />
        {api.status === "draft" && <StatusBadge status="draft" />}
        {isOwner && <span className="badge">you own this</span>}
      </div>

      <div className="panel">
        <h2>Overview</h2>
        <p style={{ marginTop: 0 }}>
          {api.description || "No description provided."}
        </p>
        <dl className="kv">
          <dt>Provider</dt>
          <dd>{api.provider}</dd>
          <dt>Version</dt>
          <dd>{api.version}</dd>
          <dt>Upstream</dt>
          <dd>
            <code className="inline">{api.baseUrl}</code>
          </dd>
          {api.tags.length > 0 && (
            <>
              <dt>Tags</dt>
              <dd>{api.tags.join(", ")}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="panel">
        <h2>Plans</h2>
        <PlanList plans={api.plans} />
      </div>

      <div className="panel">
        <h2>Quickstart</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Call the API <strong>through the Sourdough gateway</strong> — it checks
          your key, enforces your plan, and forwards to the upstream:
        </p>
        <pre className="code">{`curl ${gatewayUrl}/${slug === "echo" ? "hello?name=baker" : "ping"} \\
  -H "Authorization: Bearer <your_api_key>"`}</pre>
      </div>

      <div className="panel">
        <h2>API reference</h2>
        {api.hasSpec ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Interactive docs. <strong>Try it</strong> runs through the Sourdough
              gateway — add your API key as a Bearer token in the request auth.
            </p>
            <p style={{ display: "flex", gap: 8 }}>
              <a className="btn secondary" href={`/api/apis/${api.slug}/openapi?download=1`}>
                Download JSON
              </a>
              <a className="btn secondary" href={`/api/apis/${api.slug}/openapi?format=yaml&download=1`}>
                YAML
              </a>
            </p>
            <SpecReference gatewayUrl={gatewayUrl} specUrl={`/api/apis/${api.slug}/openapi`} />
          </>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            No OpenAPI spec yet.
            {isOwner ? " Re-publish (or use the wizard) to attach one." : ""}
          </p>
        )}
      </div>

      <div className="panel">
        <h2>Subscribe</h2>
        <SubscribePanel
          slug={api.slug}
          loggedIn={!!user}
          plans={api.plans.map((p) => ({
            id: p.id,
            name: p.name,
            priceCents: p.priceCents,
            interval: p.interval,
            quotaMonth: p.quotaMonth,
            rateLimitPerMin: p.rateLimitPerMin,
          }))}
        />
      </div>
    </>
  );
}
