"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EMPTY = {
  name: "",
  provider: "",
  category: "",
  baseUrl: "",
  version: "v1",
  pricing: "free",
  priceNote: "",
  tagline: "",
  description: "",
  tags: "",
  status: "published",
  // default plan
  planName: "Free",
  planPriceCents: "0",
  quotaMonth: "10000",
  rateLimitPerMin: "60",
};

export function PublishForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function set<K extends keyof typeof EMPTY>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrors([]);
    try {
      const res = await fetch("/api/apis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          provider: form.provider,
          category: form.category,
          baseUrl: form.baseUrl,
          version: form.version,
          pricing: form.pricing,
          priceNote: form.priceNote,
          tagline: form.tagline,
          description: form.description,
          status: form.status,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
          plan: {
            name: form.planName || "Free",
            priceCents: form.planPriceCents,
            interval: Number(form.planPriceCents) > 0 ? "month" : null,
            quotaMonth: form.quotaMonth === "" ? null : form.quotaMonth,
            rateLimitPerMin: form.rateLimitPerMin === "" ? null : form.rateLimitPerMin,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrors(json.details ?? [json.error ?? "Failed to publish"]);
        return;
      }
      router.push(`/apis/${json.data.slug}`);
    } catch {
      setErrors(["Network error — is the server running?"]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1>Publish an API</h1>
      <p className="muted" style={{ maxWidth: "60ch" }}>
        List your API on the marketplace. Tip: set the base URL to{" "}
        <code className="inline">/demo/echo</code> to reuse the built-in test
        upstream while you experiment.
      </p>

      <form onSubmit={onSubmit} style={{ maxWidth: 640, marginTop: 24 }}>
        <div className="row">
          <div className="field">
            <label htmlFor="name">Name *</label>
            <input id="name" required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Weather Oracle" />
          </div>
          <div className="field">
            <label htmlFor="provider">Provider *</label>
            <input id="provider" required value={form.provider} onChange={(e) => set("provider", e.target.value)} placeholder="Stratus Labs" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="tagline">Tagline</label>
          <input id="tagline" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Hyper-local forecasts and climate data." />
        </div>

        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea id="description" rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What does this API do, and who is it for?" />
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="category">Category</label>
            <input id="category" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Weather" />
          </div>
          <div className="field">
            <label htmlFor="version">Version</label>
            <input id="version" value={form.version} onChange={(e) => set("version", e.target.value)} placeholder="v1" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="baseUrl">Base URL (upstream) *</label>
          <input id="baseUrl" required value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} placeholder="https://api.example.com  or  /demo/echo" />
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="pricing">Pricing label</label>
            <select id="pricing" value={form.pricing} onChange={(e) => set("pricing", e.target.value)}>
              <option value="free">Free</option>
              <option value="freemium">Freemium</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="priceNote">Price note</label>
            <input id="priceNote" value={form.priceNote} onChange={(e) => set("priceNote", e.target.value)} placeholder="10k calls/mo free, then $0.50/1k" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="tags">Tags</label>
          <input id="tags" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="weather, forecast, geo" />
          <div className="hint">Comma-separated.</div>
        </div>

        <fieldset className="fieldset">
          <legend>Default plan</legend>
          <p className="hint" style={{ marginTop: 0 }}>
            The gateway enforces these limits. Leave a limit blank for unlimited.
          </p>
          <div className="row">
            <div className="field">
              <label htmlFor="planName">Plan name</label>
              <input id="planName" value={form.planName} onChange={(e) => set("planName", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="planPriceCents">Price (cents)</label>
              <input id="planPriceCents" type="number" min="0" value={form.planPriceCents} onChange={(e) => set("planPriceCents", e.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="quotaMonth">Quota (calls/month)</label>
              <input id="quotaMonth" type="number" min="0" value={form.quotaMonth} onChange={(e) => set("quotaMonth", e.target.value)} placeholder="blank = unlimited" />
            </div>
            <div className="field">
              <label htmlFor="rateLimitPerMin">Rate limit (req/min)</label>
              <input id="rateLimitPerMin" type="number" min="0" value={form.rateLimitPerMin} onChange={(e) => set("rateLimitPerMin", e.target.value)} placeholder="blank = unlimited" />
            </div>
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="published">Published (visible in marketplace)</option>
            <option value="draft">Draft (hidden)</option>
          </select>
        </div>

        {errors.length > 0 && (
          <div className="alert error">
            {errors.map((err) => (
              <div key={err}>{err}</div>
            ))}
          </div>
        )}

        <button type="submit" className="btn" disabled={loading}>
          {loading ? "Publishing…" : "Publish API"}
        </button>
      </form>
    </>
  );
}
