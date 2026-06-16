"use client";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }
  return (
    <button
      onClick={logout}
      className="linklike"
      type="button"
      aria-label="Sign out"
    >
      Sign out
    </button>
  );
}
