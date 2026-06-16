"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function OwnedApiRow({
  slug,
  name,
  status,
}: {
  slug: string;
  name: string;
  status: "draft" | "published";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Delete "${name}"? This removes its plans, subscriptions, and keys.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/apis/${slug}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sub">
      <div className="stack">
        <strong>
          <Link href={`/apis/${slug}`}>{name}</Link>
        </strong>
        <span className={`badge ${status}`}>{status}</span>
      </div>
      <button className="btn danger" disabled={busy} onClick={remove}>
        Delete
      </button>
    </div>
  );
}
