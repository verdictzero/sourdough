"use client";

import { useState } from "react";
import Link from "next/link";

const STEPS = ["Basics", "Upstream", "Spec", "Plan", "Review"];
const SPEC_MAX_BYTES = 2_000_000;

const EMPTY = {
  name: "",
  provider: "",
  category: "",
  tagline: "",
  description: "",
  baseUrl: "",
  version: "v1",
  specMode: "skip" as "skip" | "paste" | "url" | "upload",
  specRaw: "",
  specUrl: "",
  planName: "Free",
  planPriceCents: "0",
  quotaMonth: "10000",
  rateLimitPerMin: "60",
  status: "published",
};

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; status: number; latencyMs: number }
  | { kind: "fail"; error: string };

type SpecState =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "ok"; title: string; openapiVersion: string; opCount: number }
  | { kind: "fail"; error: string };

export function PublishWizard() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [stepError, setStepError] = useState("");
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [spec, setSpec] = useState<SpecState>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [result, setResult] = useState<
    { slug: string; name: string; specWarning: string } | null
  >(null);

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validateStep(s: number): string {
    if (s === 0) {
      if (!form.name.trim()) return "Give your API a name.";
      if (!form.provider.trim()) return "Who's the provider?";
    }
    if (s === 1) {
      if (!form.baseUrl.trim()) return "Enter the upstream base URL.";
      if (!/^(https?:\/\/|\/)/i.test(form.baseUrl.trim()))
        return "Base URL must start with http(s):// or / (relative).";
    }
    return "";
  }

  function next() {
    const err = validateStep(step);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setStepError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function testUpstream() {
    if (!form.baseUrl.trim()) {
      setStepError("Enter a base URL first.");
      return;
    }
    setTest({ kind: "testing" });
    try {
      const res = await fetch("/api/ingest/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: form.baseUrl.trim() }),
      });
      const json = await res.json();
      if (json.ok) setTest({ kind: "ok", status: json.status, latencyMs: json.latencyMs });
      else setTest({ kind: "fail", error: json.error ?? "Unreachable" });
    } catch {
      setTest({ kind: "fail", error: "Network error" });
    }
  }

  function onSpecFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > SPEC_MAX_BYTES) {
      setSpec({ kind: "fail", error: "File exceeds the 2 MB limit." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      set("specRaw", String(reader.result ?? ""));
      setSpec({ kind: "idle" });
    };
    reader.readAsText(file);
  }

  async function validateSpec() {
    const usingUrl = form.specMode === "url";
    if (usingUrl ? !form.specUrl.trim() : !form.specRaw.trim()) {
      setSpec({ kind: "fail", error: "Provide a spec first." });
      return;
    }
    setSpec({ kind: "validating" });
    try {
      const res = await fetch("/api/ingest/spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(usingUrl ? { url: form.specUrl.trim() } : { raw: form.specRaw }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSpec({ kind: "fail", error: json.details?.join(", ") ?? json.error ?? "Invalid spec" });
        return;
      }
      setSpec({
        kind: "ok",
        title: json.data.title || "(untitled)",
        openapiVersion: json.data.openapiVersion,
        opCount: json.data.opCount,
      });
    } catch {
      setSpec({ kind: "fail", error: "Network error" });
    }
  }

  const hasSpecInput =
    form.specMode !== "skip" &&
    (form.specMode === "url" ? form.specUrl.trim() : form.specRaw.trim());

  async function publish() {
    setSubmitting(true);
    setSubmitErrors([]);
    try {
      const res = await fetch("/api/apis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          provider: form.provider,
          category: form.category,
          tagline: form.tagline,
          description: form.description,
          baseUrl: form.baseUrl,
          version: form.version,
          status: form.status,
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
        setSubmitErrors(json.details ?? [json.error ?? "Failed to publish"]);
        return;
      }

      const slug: string = json.data.slug;
      let specWarning = "";
      if (hasSpecInput) {
        const specBody =
          form.specMode === "url"
            ? { url: form.specUrl.trim(), source: "url" }
            : { raw: form.specRaw, source: form.specMode };
        const sres = await fetch(`/api/apis/${slug}/spec`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(specBody),
        });
        if (!sres.ok) {
          const sj = await sres.json().catch(() => ({}));
          specWarning =
            sj.details?.join(", ") ?? sj.error ?? "the spec could not be saved";
        }
      }
      setResult({ slug, name: json.data.name, specWarning });
    } catch {
      setSubmitErrors(["Network error — is the server running?"]);
    } finally {
      setSubmitting(false);
    }
  }

  // --- success screen --------------------------------------------------------
  if (result) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return (
      <div style={{ maxWidth: 640 }}>
        <h1>🎉 Published</h1>
        <div className="key-reveal">
          <strong>{result.name}</strong> is live.{" "}
          <Link href={`/apis/${result.slug}`} style={{ color: "var(--crust)", fontWeight: 600 }}>
            View its page →
          </Link>
          <p className="muted" style={{ margin: "10px 0 6px" }}>
            Consumers call it through the gateway:
          </p>
          <pre className="code">{`curl ${origin}/gateway/${result.slug}/ \\
  -H "Authorization: Bearer <their_api_key>"`}</pre>
        </div>
        {result.specWarning && (
          <div className="alert error" style={{ marginTop: 12 }}>
            Published, but {result.specWarning}. You can add the spec later from the
            API page.
          </div>
        )}
        <p style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <Link href="/dashboard" className="btn secondary">Go to dashboard</Link>
          <button
            className="btn secondary"
            onClick={() => {
              setForm(EMPTY);
              setStep(0);
              setTest({ kind: "idle" });
              setSpec({ kind: "idle" });
              setResult(null);
            }}
          >
            Publish another
          </button>
        </p>
      </div>
    );
  }

  // --- wizard ----------------------------------------------------------------
  return (
    <div style={{ maxWidth: 640 }}>
      <h1>Publish an API</h1>
      <p className="muted">A quick, guided walkthrough. You can edit anything later.</p>

      <ol className="stepper">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`step ${i === step ? "current" : ""} ${i < step ? "done" : ""}`}
          >
            <span className="step-num">{i < step ? "✓" : i + 1}</span>
            <span className="step-label">{label}</span>
          </li>
        ))}
      </ol>

      <div className="panel">
        {step === 0 && (
          <>
            <h2>About your API</h2>
            <div className="row">
              <div className="field">
                <label htmlFor="name">Name *</label>
                <input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Weather Oracle" />
              </div>
              <div className="field">
                <label htmlFor="provider">Provider *</label>
                <input id="provider" value={form.provider} onChange={(e) => set("provider", e.target.value)} placeholder="Stratus Labs" />
              </div>
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
              <label htmlFor="tagline">Tagline</label>
              <input id="tagline" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Hyper-local forecasts and climate data." />
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea id="description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What does it do, and who is it for?" />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2>Connect your upstream</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              The base URL the gateway forwards to. New to this? Use{" "}
              <code className="inline">/demo/echo</code> to try the built-in test
              upstream.
            </p>
            <div className="field">
              <label htmlFor="baseUrl">Base URL *</label>
              <input
                id="baseUrl"
                value={form.baseUrl}
                onChange={(e) => {
                  set("baseUrl", e.target.value);
                  setTest({ kind: "idle" });
                }}
                placeholder="https://api.example.com  or  /demo/echo"
              />
              <div className="hint">
                <code className="inline">/gateway/your-api/v1/x</code> →{" "}
                <code className="inline">{form.baseUrl || "https://api.example.com"}/v1/x</code>
              </div>
            </div>
            <button type="button" className="btn secondary" onClick={testUpstream} disabled={test.kind === "testing"}>
              {test.kind === "testing" ? "Testing…" : "Test connection"}
            </button>
            {test.kind === "ok" && (
              <div className="test-result ok">✓ Reachable — HTTP {test.status} ({test.latencyMs} ms)</div>
            )}
            {test.kind === "fail" && (
              <div className="test-result fail">✗ {test.error}. You can still continue.</div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h2>OpenAPI spec <span className="muted" style={{ fontWeight: 400, fontSize: "0.9rem" }}>(optional)</span></h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Add an OpenAPI 3.x document to get interactive reference docs and a
              Try-it console on your API page. You can skip and add it later.
            </p>
            <div className="field">
              <label>Source</label>
              <div className="spec-modes">
                {(["skip", "paste", "url", "upload"] as const).map((m) => (
                  <label key={m} className={`mode-choice ${form.specMode === m ? "sel" : ""}`}>
                    <input
                      type="radio"
                      name="specMode"
                      checked={form.specMode === m}
                      onChange={() => {
                        set("specMode", m);
                        setSpec({ kind: "idle" });
                      }}
                    />
                    <span>{m === "skip" ? "Skip" : m[0].toUpperCase() + m.slice(1)}</span>
                  </label>
                ))}
              </div>
            </div>

            {form.specMode === "paste" && (
              <div className="field">
                <label htmlFor="specRaw">Paste OpenAPI (JSON or YAML)</label>
                <textarea
                  id="specRaw"
                  rows={10}
                  value={form.specRaw}
                  onChange={(e) => {
                    set("specRaw", e.target.value);
                    setSpec({ kind: "idle" });
                  }}
                  placeholder={'{\n  "openapi": "3.0.0",\n  "info": { "title": "My API", "version": "1.0.0" },\n  "paths": { ... }\n}'}
                  style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.85rem" }}
                />
              </div>
            )}

            {form.specMode === "url" && (
              <div className="field">
                <label htmlFor="specUrl">Spec URL</label>
                <input
                  id="specUrl"
                  value={form.specUrl}
                  onChange={(e) => {
                    set("specUrl", e.target.value);
                    setSpec({ kind: "idle" });
                  }}
                  placeholder="https://api.example.com/openapi.json"
                />
              </div>
            )}

            {form.specMode === "upload" && (
              <div className="field">
                <label htmlFor="specFile">Upload .json / .yaml</label>
                <input id="specFile" type="file" accept=".json,.yaml,.yml,application/json,text/yaml" onChange={onSpecFile} />
                {form.specRaw && <div className="hint">Loaded {form.specRaw.length.toLocaleString()} chars.</div>}
              </div>
            )}

            {form.specMode !== "skip" && (
              <>
                <button type="button" className="btn secondary" onClick={validateSpec} disabled={spec.kind === "validating"}>
                  {spec.kind === "validating" ? "Validating…" : "Validate spec"}
                </button>
                {spec.kind === "ok" && (
                  <div className="test-result ok">
                    ✓ Valid — {spec.title} ({spec.openapiVersion}), {spec.opCount} operation{spec.opCount === 1 ? "" : "s"}
                  </div>
                )}
                {spec.kind === "fail" && <div className="test-result fail">✗ {spec.error}</div>}
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h2>Set a plan</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              The gateway enforces these per subscriber. Leave a limit blank for unlimited.
            </p>
            <div className="row">
              <div className="field">
                <label htmlFor="planName">Plan name</label>
                <input id="planName" value={form.planName} onChange={(e) => set("planName", e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="planPriceCents">Price (cents / month)</label>
                <input id="planPriceCents" type="number" min="0" value={form.planPriceCents} onChange={(e) => set("planPriceCents", e.target.value)} />
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="quotaMonth">Quota (calls / month)</label>
                <input id="quotaMonth" type="number" min="0" value={form.quotaMonth} onChange={(e) => set("quotaMonth", e.target.value)} placeholder="blank = unlimited" />
              </div>
              <div className="field">
                <label htmlFor="rateLimitPerMin">Rate limit (req / min)</label>
                <input id="rateLimitPerMin" type="number" min="0" value={form.rateLimitPerMin} onChange={(e) => set("rateLimitPerMin", e.target.value)} placeholder="blank = unlimited" />
              </div>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2>Review &amp; publish</h2>
            <dl className="kv">
              <dt>Name</dt><dd>{form.name}</dd>
              <dt>Provider</dt><dd>{form.provider}</dd>
              <dt>Category</dt><dd>{form.category || "General"}</dd>
              <dt>Upstream</dt><dd><code className="inline">{form.baseUrl}</code> ({form.version || "v1"})</dd>
              <dt>Spec</dt><dd>
                {form.specMode === "skip"
                  ? "none (add later)"
                  : spec.kind === "ok"
                    ? `${spec.title} — ${spec.opCount} operation${spec.opCount === 1 ? "" : "s"}`
                    : "provided (not validated — will be checked on publish)"}
              </dd>
              <dt>Plan</dt><dd>
                {form.planName || "Free"} —{" "}
                {Number(form.planPriceCents) > 0 ? `$${(Number(form.planPriceCents) / 100).toFixed(2)}/mo` : "Free"},{" "}
                {form.quotaMonth ? `${Number(form.quotaMonth).toLocaleString()} calls/mo` : "unlimited calls"},{" "}
                {form.rateLimitPerMin ? `${form.rateLimitPerMin}/min` : "unlimited rate"}
              </dd>
            </dl>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="status">Visibility</label>
              <select id="status" value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="published">Published — visible in the marketplace</option>
                <option value="draft">Draft — hidden while you finish</option>
              </select>
            </div>
            {submitErrors.length > 0 && (
              <div className="alert error">
                {submitErrors.map((e) => <div key={e}>{e}</div>)}
              </div>
            )}
          </>
        )}

        {stepError && <div className="alert error">{stepError}</div>}
      </div>

      <div className="wizard-nav">
        <button type="button" className="btn secondary" onClick={back} disabled={step === 0 || submitting}>
          ← Back
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn" onClick={next}>Next →</button>
        ) : (
          <button type="button" className="btn" onClick={publish} disabled={submitting}>
            {submitting ? "Publishing…" : "Publish API"}
          </button>
        )}
      </div>
    </div>
  );
}
