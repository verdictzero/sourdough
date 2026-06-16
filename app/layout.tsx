import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth/session";
import { LogoutButton } from "@/components/LogoutButton";

export const metadata: Metadata = {
  title: "Sourdough — API Marketplace",
  description:
    "A lean API marketplace: browse, publish, and subscribe to APIs.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        <header className="nav">
          <div className="nav-inner">
            <Link href="/" className="brand">
              🥖 Sourdough
            </Link>
            <nav className="nav-links">
              <Link href="/">Marketplace</Link>
              {user && <Link href="/publish">Publish</Link>}
              {user && <Link href="/dashboard">Dashboard</Link>}
              {user ? (
                <>
                  <span className="nav-user" title={user.email}>
                    {user.name}
                  </span>
                  <LogoutButton />
                </>
              ) : (
                <>
                  <Link href="/login">Sign in</Link>
                  <Link href="/signup" className="nav-cta">
                    Sign up
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
        <footer className="footer">Sourdough · a lean API marketplace</footer>
      </body>
    </html>
  );
}
