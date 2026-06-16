import Link from "next/link";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Docs — Sourdough",
  description: "How to ingest, publish, and consume APIs on Sourdough.",
};

const TOC: { id: string; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "concepts", label: "Core concepts" },
  { id: "ingest", label: "Ingesting your API" },
  { id: "spec", label: "OpenAPI specs" },
  { id: "consume", label: "Calling an API" },
  { id: "limits", label: "Limits & errors" },
  { id: "keys", label: "Managing keys" },
  { id: "rest", label: "REST API" },
  { id: "security", label: "Security" },
];

export default async function DocsPage() {
  const user = await getCurrentUser();
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  return (
    <div className="docs-layout">
      <aside className="docs-toc">
        <strong>On this page</strong>
        <nav>
          {TOC.map((t) => (
            <a key={t.id} href={`#${t.id}`}>
              {t.label}
            </a>
          ))}
        </nav>
      </aside>

      <article className="docs-body">
        <h1>Documentation</h1>

        {user ? (
          <div className="callout ok">
            <strong>Signed in as {user.name}.</strong> Your gateway base is{" "}
            <code className="inline">{origin}/gateway/&lt;api-slug&gt;</code>.{" "}
            <Link href="/publish">Publish an API →</Link> ·{" "}
            <Link href="/dashboard">Your dashboard →</Link>
          </div>
        ) : (
          <div className="callout">
            <strong>New here?</strong> <Link href="/signup">Create an account</Link>{" "}
            to publish APIs or subscribe and get a key. You can browse the{" "}
            <Link href="/">marketplace</Link> without one.
          </div>
        )}

        <section id="overview">
          <h2>Overview</h2>
          <p>
            Sourdough is an API marketplace and gateway. There are two roles:
          </p>
          <ul>
            <li>
              <strong>Providers</strong> <em>ingest</em> an API — list it, point
              it at an upstream, and define pricing plans.
            </li>
            <li>
              <strong>Consumers</strong> discover an API, subscribe on a plan,
              and receive an API key.
            </li>
          </ul>
          <p>
            Every consumer request flows through the <strong>gateway</strong>,
            which authenticates the key, enforces the plan&apos;s rate limit and
            monthly quota, records usage, and proxies to the upstream. Consumers
            never call your upstream directly — they call Sourdough.
          </p>
          <pre className="code">{`Consumer ──key──▶  ${origin}/gateway/<slug>/<path>
                     │  authenticate key
                     │  enforce rate limit + monthly quota
                     │  record usage
                     ▼
                upstream API  ──▶  response (+ X-RateLimit-* headers)`}</pre>
        </section>

        <section id="concepts">
          <h2>Core concepts</h2>
          <dl className="kv">
            <dt>Listing</dt>
            <dd>An API in the catalog: name, description, category, upstream URL, version.</dd>
            <dt>Plan</dt>
            <dd>
              A tier on a listing carrying limits the gateway enforces:{" "}
              <code className="inline">quota / month</code> and{" "}
              <code className="inline">requests / minute</code>.
            </dd>
            <dt>Subscription</dt>
            <dd>A consumer&apos;s link to a listing on a chosen plan.</dd>
            <dt>API key</dt>
            <dd>
              The credential tied to a subscription. Stored only as a hash — the
              plaintext is shown once, at creation.
            </dd>
            <dt>Gateway</dt>
            <dd>
              The single entry point consumers call:{" "}
              <code className="inline">/gateway/&lt;slug&gt;/&lt;path&gt;</code>.
            </dd>
          </dl>
        </section>

        <section id="ingest">
          <h2>Ingesting your API</h2>
          <p>
            The <Link href="/publish">Publish wizard</Link> walks you through it
            in four steps. Here&apos;s what each one means:
          </p>
          <ol className="docs-steps">
            <li>
              <strong>Basics</strong> — name, provider, category, and a short
              description. These appear on your listing in the marketplace.
            </li>
            <li>
              <strong>Upstream</strong> — the base URL the gateway forwards to,
              e.g. <code className="inline">https://api.example.com</code>. The
              consumer&apos;s path is appended:
              <br />
              <code className="inline">
                /gateway/your-api/v1/users
              </code>{" "}
              → <code className="inline">https://api.example.com/v1/users</code>.
              <br />
              Tip: set it to <code className="inline">/demo/echo</code> to reuse
              Sourdough&apos;s built-in test upstream while you experiment. The
              wizard can test reachability for you.
            </li>
            <li>
              <strong>Plan</strong> — name, price, and the limits the gateway
              enforces. Leave a limit blank for unlimited. Example: a Free plan
              with <code className="inline">10,000</code> calls/month and{" "}
              <code className="inline">60</code> req/min.
            </li>
            <li>
              <strong>Review &amp; publish</strong> — choose{" "}
              <strong>Published</strong> (visible in the marketplace) or{" "}
              <strong>Draft</strong> (hidden while you finish), then publish.
            </li>
          </ol>
          <p>
            You own what you publish: only you (or an admin) can edit or delete
            it, and you can manage it from your{" "}
            <Link href="/dashboard">dashboard</Link>.
          </p>
        </section>

        <section id="spec">
          <h2>OpenAPI specs</h2>
          <p>
            Attach an OpenAPI 3.x document to your API — paste it, link a URL, or
            upload a file in the publish wizard&apos;s <strong>Spec</strong> step.
            It&apos;s validated server-side and stored with your listing.
          </p>
          <ul>
            <li>
              The API page then renders <strong>interactive reference docs</strong>
              with a <strong>Try it</strong> console. Try-it requests route through
              the gateway (<code className="inline">/gateway/&lt;slug&gt;</code>), so
              they&apos;re authenticated, rate-limited, and metered like any call —
              add your key as a Bearer token in the request auth.
            </li>
            <li>
              The spec is exportable at{" "}
              <code className="inline">GET /api/apis/&lt;slug&gt;/openapi</code>{" "}
              (<code className="inline">?format=yaml</code> for YAML,{" "}
              <code className="inline">?download=1</code> to download).
            </li>
          </ul>
        </section>

        <section id="consume">
          <h2>Calling an API</h2>
          <ol className="docs-steps">
            <li>Open an API in the marketplace and click <strong>Subscribe</strong> (pick a plan).</li>
            <li>Copy the API key shown — it&apos;s displayed <strong>once</strong>.</li>
            <li>
              Call it through the gateway with the key as a Bearer token:
            </li>
          </ol>
          <pre className="code">{`curl ${origin}/gateway/echo/hello?name=baker \\
  -H "Authorization: Bearer sd_live_your_key_here"`}</pre>
          <p>
            The gateway validates the key, applies your plan, forwards to the
            upstream, and returns the upstream&apos;s response with{" "}
            <code className="inline">X-RateLimit-*</code> headers attached.
          </p>
        </section>

        <section id="limits">
          <h2>Limits &amp; errors</h2>
          <p>The gateway returns standard status codes:</p>
          <dl className="kv">
            <dt>401</dt>
            <dd>Missing, invalid, or revoked API key.</dd>
            <dt>403</dt>
            <dd>Key valid but the subscription is inactive or doesn&apos;t match this API.</dd>
            <dt>429</dt>
            <dd>
              Rate limit (per minute) or monthly quota exceeded. Rate-limit
              responses include a <code className="inline">Retry-After</code> header.
            </dd>
            <dt>502</dt>
            <dd>The upstream couldn&apos;t be reached or errored.</dd>
          </dl>
          <p>
            Successful responses carry{" "}
            <code className="inline">X-RateLimit-Limit</code> and{" "}
            <code className="inline">X-RateLimit-Remaining</code> so you can pace
            your calls.
          </p>
        </section>

        <section id="keys">
          <h2>Managing keys</h2>
          <p>
            From your <Link href="/dashboard">dashboard</Link> you can mint
            additional keys, revoke any key, and cancel a subscription (which
            revokes all its keys). Because keys are stored hashed, the plaintext
            is only ever shown at creation — if you lose one, mint a new one and
            revoke the old.
          </p>
        </section>

        <section id="rest">
          <h2>REST API</h2>
          <p>Everything the UI does is also a JSON API. Responses are <code className="inline">{`{ data }`}</code> on success, <code className="inline">{`{ error, details? }`}</code> on failure.</p>
          <table className="usage-table">
            <thead>
              <tr><th>Method</th><th>Path</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td>POST</td><td><code className="inline">/api/auth/signup·login·logout</code></td><td>Account + session</td></tr>
              <tr><td>GET</td><td><code className="inline">/api/apis</code></td><td>List/search (<code className="inline">?q ?category ?status ?mine</code>)</td></tr>
              <tr><td>POST</td><td><code className="inline">/api/apis</code></td><td>Publish (auth)</td></tr>
              <tr><td>GET / PATCH / DELETE</td><td><code className="inline">/api/apis/:slug</code></td><td>Read / update / delete</td></tr>
              <tr><td>PUT</td><td><code className="inline">/api/apis/:slug/spec</code></td><td>Set/replace OpenAPI spec (owner)</td></tr>
              <tr><td>GET</td><td><code className="inline">/api/apis/:slug/openapi</code></td><td>Export spec (public)</td></tr>
              <tr><td>POST</td><td><code className="inline">/api/apis/:slug/subscribe</code></td><td>Subscribe → key (once)</td></tr>
              <tr><td>GET</td><td><code className="inline">/api/subscriptions</code></td><td>Your subscriptions + usage</td></tr>
              <tr><td>POST</td><td><code className="inline">/api/subscriptions/:id/keys</code></td><td>Mint another key</td></tr>
              <tr><td>DELETE</td><td><code className="inline">/api/keys/:id</code></td><td>Revoke a key</td></tr>
              <tr><td>ANY</td><td><code className="inline">/gateway/:slug/*</code></td><td>Call a subscribed API</td></tr>
            </tbody>
          </table>
        </section>

        <section id="security">
          <h2>Security</h2>
          <ul>
            <li>API keys are stored as SHA-256 hashes; plaintext is shown once.</li>
            <li>Sessions are httpOnly cookies; passwords are scrypt-hashed.</li>
            <li>Publish/edit/delete are gated to the listing&apos;s owner (or an admin).</li>
            <li>In production the session cookie is <code className="inline">Secure</code>, so the site must be served over HTTPS.</li>
          </ul>
        </section>

        <p className="muted" style={{ marginTop: 32 }}>
          {user ? (
            <Link href="/publish" className="btn">Publish an API →</Link>
          ) : (
            <Link href="/signup" className="btn">Get started →</Link>
          )}
        </p>
      </article>
    </div>
  );
}
