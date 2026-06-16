"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import "@scalar/api-reference-react/style.css";

// Heavy renderer — load lazily, client-only (Scalar is untested under SSR).
const ApiReferenceReact = dynamic(
  () => import("@scalar/api-reference-react").then((m) => m.ApiReferenceReact),
  { ssr: false, loading: () => <p className="muted">Loading reference…</p> },
);

export function SpecReference({
  gatewayUrl,
  specUrl,
}: {
  gatewayUrl: string;
  specUrl: string;
}) {
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(specUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((d) => active && setDoc(d))
      .catch(() => active && setError("Could not load the spec."));
    return () => {
      active = false;
    };
  }, [specUrl]);

  if (error) return <p className="muted">{error}</p>;
  if (!doc) return <p className="muted">Loading reference…</p>;

  return (
    <div className="scalar-wrap">
      <ApiReferenceReact
        configuration={{
          content: doc,
          // Route "Try it" through the Sourdough gateway (auth + limits + usage).
          servers: [{ url: gatewayUrl, description: "Sourdough gateway" }],
        }}
      />
    </div>
  );
}
