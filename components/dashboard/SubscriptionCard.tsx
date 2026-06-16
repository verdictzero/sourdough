"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Key = {
  id: string;
  keyPrefix: string;
  label: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type SubCardData = {
  id: string;
  status: "active" | "revoked";
  usageThisMonth: number;
  api: { slug: string; name: string } | null;
  plan: { name: string; quotaMonth: number | null; rateLimitPerMin: number | null } | null;
  keys: Key[];
};

export function SubscriptionCard({ sub }: { sub: SubCardData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  async function call(url: string, method: string) {
    setBusy(true);
    try {
      const res = await fetch(url, { method });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data?.apiKey) setNewKey(json.data.apiKey);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const quota = sub.plan?.quotaMonth ?? null;
  const pct = quota ? Math.min(100, Math.round((sub.usageThisMonth / quota) * 100)) : 0;
  const activeKeys = sub.keys.filter((k) => !k.revokedAt);

  return (
    <div className="panel sub-card">
      <div className="card-head" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>
          {sub.api ? <Link href={`/apis/${sub.api.slug}`}>{sub.api.name}</Link> : "(API removed)"}
        </h3>
        <span className={`badge ${sub.status}`}>{sub.status}</span>
      </div>

      <div className="muted" style={{ fontSize: "0.9rem", marginBottom: 10 }}>
        Plan: <strong>{sub.plan?.name ?? "—"}</strong>
        {sub.plan?.rateLimitPerMin != null && <> · {sub.plan.rateLimitPerMin}/min</>}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="usage-line">
          <span>Usage this month</span>
          <span>
            {sub.usageThisMonth.toLocaleString()}
            {quota ? ` / ${quota.toLocaleString()}` : " (unlimited)"}
          </span>
        </div>
        {quota != null && (
          <div className="meter">
            <div className="meter-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      <div className="keys">
        {activeKeys.length === 0 && <p className="muted" style={{ fontSize: "0.85rem" }}>No active keys.</p>}
        {activeKeys.map((k) => (
          <div className="key-row" key={k.id}>
            <code className="inline">{k.keyPrefix}…</code>
            <span className="muted" style={{ fontSize: "0.78rem" }}>
              {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleString()}` : "never used"}
            </span>
            <button className="btn danger" disabled={busy} onClick={() => call(`/api/keys/${k.id}`, "DELETE")}>
              Revoke key
            </button>
          </div>
        ))}
      </div>

      {newKey && (
        <div className="key-reveal" style={{ marginTop: 12 }}>
          <strong>New key (shown once):</strong>
          <code className="inline" style={{ display: "block", padding: 10, marginTop: 6 }}>{newKey}</code>
        </div>
      )}

      {sub.status === "active" && (
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button className="btn secondary" disabled={busy} onClick={() => call(`/api/subscriptions/${sub.id}/keys`, "POST")}>
            + New key
          </button>
          <button className="btn danger" disabled={busy} onClick={() => call(`/api/subscriptions/${sub.id}`, "DELETE")}>
            Cancel subscription
          </button>
        </div>
      )}
    </div>
  );
}
