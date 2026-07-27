"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { navForRole } from "@/lib/navigation";
import { NotificationBell } from "@/components/ui/notification-bell";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  chef: "Chef",
  waiter: "Waiter",
  cashier: "Cashier",
  store_manager: "Store Manager",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const DARK_GRADIENT = "linear-gradient(135deg, #27272a, #09090b)";

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
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
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
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6">
          {/* Top row: brand + user */}
          <div className="flex h-14 items-center justify-between gap-4">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm"
                style={{ backgroundImage: DARK_GRADIENT }}
              >
                R
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">RestaurantOS</span>
            </Link>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <NotificationBell />
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{user.full_name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{ROLE_LABELS[user.role] || user.role}</p>
              </div>
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm"
                style={{ backgroundImage: DARK_GRADIENT }}
                title={user.full_name}
              >
                {initials(user.full_name)}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Sign out
              </button>
            </div>
          </div>

          {/* Nav row: horizontal pills, no wrap, scrollable on overflow */}
          <nav className="-mb-px flex gap-1 overflow-x-auto pb-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navItems.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-950"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
