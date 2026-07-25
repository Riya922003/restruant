"use client";

import Link from "next/link";
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

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  const tiles = navForRole(user.role).filter((item) => item.href !== "/dashboard");

  return (
    <section className="mx-auto max-w-6xl">
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <p className="text-sm text-zinc-500">Signed in as</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">
          {user.full_name}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          {ROLE_LABELS[user.role] || user.role} · {user.email}
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600">
          Authentication and role based access are live. The modules below are the
          areas your role can access. Sales, active orders, occupancy, low stock,
          expense, and purchase analytics will populate this overview as the module
          APIs come online.
        </p>
      </div>

      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-zinc-500">
        Your modules
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-900 hover:shadow-sm"
          >
            <p className="text-base font-semibold text-zinc-900 group-hover:text-zinc-950">
              {item.label}
            </p>
            <p className="mt-1 text-sm text-zinc-500">Open {item.label.toLowerCase()}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
