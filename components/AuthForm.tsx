"use client";

import { useState } from "react";
import Link from "next/link";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isSignup ? { email, name, password } : { email, password },
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrors(json.details ?? [json.error ?? "Something went wrong"]);
        return;
      }
      // Full navigation so the server-rendered nav picks up the new session.
      const next =
        new URLSearchParams(window.location.search).get("next") || "/dashboard";
      window.location.href = next;
    } catch {
      setErrors(["Network error — is the server running?"]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "0 auto" }}>
      <h1>{isSignup ? "Create your account" : "Sign in"}</h1>
      <p className="muted">
        {isSignup
          ? "Publish APIs and manage subscriptions."
          : "Welcome back to Sourdough."}
      </p>
      <form onSubmit={onSubmit} style={{ marginTop: 20 }}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {isSignup && (
          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="optional"
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {isSignup && <div className="hint">At least 8 characters.</div>}
        </div>

        {errors.length > 0 && (
          <div className="alert error">
            {errors.map((err) => (
              <div key={err}>{err}</div>
            ))}
          </div>
        )}

        <button type="submit" className="btn" disabled={loading}>
          {loading ? "…" : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="muted" style={{ marginTop: 18, fontSize: "0.9rem" }}>
        {isSignup ? (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link href="/signup">Create an account</Link>
          </>
        )}
      </p>
    </div>
  );
}
