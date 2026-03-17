"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { clearAdminSession, loadAdminSession, type AdminSession } from "../lib/session";

const NAV_ITEMS = [
  { href: "/users", label: "Users" },
  { href: "/abuse", label: "Abuse Queue" },
  { href: "/numbers", label: "Numbers" },
  { href: "/cost", label: "Cost" },
  { href: "/settings", label: "Settings" }
];

export function AdminShell({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(null);

  useEffect(() => {
    const currentSession = loadAdminSession();
    if (!currentSession) {
      router.replace("/login");
      return;
    }

    setSession(currentSession);
  }, [router]);

  const activeLabel = useMemo(
    () => NAV_ITEMS.find((item) => pathname.startsWith(item.href))?.label ?? "Console",
    [pathname]
  );

  if (!session) {
    return null;
  }

  return (
    <main className="page-shell">
      <div className="admin-layout">
        <aside className="sidebar">
          <div className="brand-block">
            <span className="eyebrow" style={{ color: "rgba(246, 239, 227, 0.74)" }}>
              FreeLine Operator
            </span>
            <h1 className="brand-title" style={{ marginTop: 14 }}>
              {activeLabel}
            </h1>
            <p className="muted" style={{ color: "rgba(246, 239, 227, 0.74)" }}>
              {session.email}
            </p>
          </div>

          <nav className="nav-list">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                className="nav-link"
                data-active={String(pathname.startsWith(item.href))}
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <button
            className="button-secondary"
            onClick={() => {
              clearAdminSession();
              router.replace("/login");
            }}
            type="button"
          >
            Sign out
          </button>
        </aside>

        <section className="admin-main">{children}</section>
      </div>
    </main>
  );
}
