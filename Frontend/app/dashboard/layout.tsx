"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { navForRole } from "@/lib/navigation";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  chef: "Chef",
  waiter: "Waiter",
  cashier: "Cashier",
  store_manager: "Store Manager",
};

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Client-side guard. Backend still enforces auth on every request; this only
  // improves UX by redirecting unauthenticated users to login.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500">
        Loading...
      </div>
    );
  }

  const navItems = navForRole(user.role);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <aside className="border-b border-zinc-200 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <Link className="font-semibold" href="/dashboard">
              RestaurantOS
            </Link>
            <nav className="flex flex-wrap gap-1 text-sm text-zinc-600">
              {navItems.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded px-2.5 py-1 transition ${
                      active
                        ? "bg-zinc-900 text-white"
                        : "hover:bg-zinc-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-zinc-900">{user.full_name}</p>
              <p className="text-xs text-zinc-500">
                {ROLE_LABELS[user.role] || user.role}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition hover:border-zinc-900 hover:bg-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
