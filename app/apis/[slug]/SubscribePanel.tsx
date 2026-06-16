"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/components/PlanList";

type PlanOption = {
  id: string;
  name: string;
  priceCents: number;
  interval: string | null;
  quotaMonth: number | null;
  rateLimitPerMin: number | null;
};

type Result = { apiKey: string };

export function SubscribePanel({
  slug,
  loggedIn,
  plans,
}: {
  slug: string;
  loggedIn: boolean;
  plans: PlanOption[];
}) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  if (!loggedIn) {
    return (
      <p>
        <Link
          href={`/login?next=${encodeURIComponent(`/apis/${slug}`)}`}
          className="btn"
        >
          Sign in to subscribe
        </Link>
      </p>
    );
  }

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/apis/${slug}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.details?.join(", ") ?? json.error ?? "Subscription failed");
        return;
      }
      setResult({ apiKey: json.data.apiKey });
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const sample = slug === "echo" ? "hello?name=baker" : "ping";
    return (
      <div className="key-reveal">
        <strong>Subscribed! Here is your API key — copy it now.</strong>
        <p className="muted" style={{ margin: "6px 0 10px" }}>
          It&apos;s shown once and stored only as a hash. You can mint more from
          your dashboard.
        </p>
        <code className="inline" style={{ display: "block", padding: 10 }}>
          {result.apiKey}
        </code>
        <p className="muted" style={{ marginTop: 12, fontSize: "0.85rem" }}>
          Try it:
        </p>
        <pre className="code">{`curl ${origin}/gateway/${slug}/${sample} \\
  -H "Authorization: Bearer ${result.apiKey}"`}</pre>
        <p style={{ marginTop: 12 }}>
          <Link href="/dashboard" style={{ color: "var(--crust)", fontWeight: 600 }}>
            Go to your dashboard →
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={subscribe}>
      {plans.length > 1 && (
        <div className="field">
          <label>Choose a plan</label>
          <div className="plan-choices">
            {plans.map((p) => (
              <label key={p.id} className={`plan-choice ${planId === p.id ? "sel" : ""}`}>
                <input
                  type="radio"
                  name="plan"
                  value={p.id}
                  checked={planId === p.id}
                  onChange={() => setPlanId(p.id)}
                />
                <span>
                  <strong>{p.name}</strong> — {formatPrice(p.priceCents, p.interval)}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
      {error && <div className="alert error">{error}</div>}
      <button type="submit" className="btn" disabled={loading}>
        {loading ? "Subscribing…" : "Subscribe & get API key"}
      </button>
    </form>
  );
}
