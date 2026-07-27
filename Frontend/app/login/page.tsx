"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { ThemeToggle } from "@/components/theme/theme-toggle";

// Seeded demo accounts, one per role, for quick sign-in during review.
const TEST_ACCOUNTS: { label: string; email: string; password: string }[] = [
  { label: "Owner", email: "owner@restaurantos.test", password: "Owner@123" },
  { label: "Manager", email: "manager@restaurantos.test", password: "Manager@123" },
  { label: "Chef", email: "chef@restaurantos.test", password: "Chef@123" },
  { label: "Waiter", email: "waiter@restaurantos.test", password: "Waiter@123" },
  { label: "Cashier", email: "cashier@restaurantos.test", password: "Cashier@123" },
  { label: "Store Manager", email: "store@restaurantos.test", password: "Store@123" },
];

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState("owner@restaurantos.test");
  const [password, setPassword] = useState("Owner@123");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If already signed in, skip the form.
  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function submit(nextEmail: string, nextPassword: string) {
    setError(null);
    setSubmitting(true);
    try {
      await login(nextEmail, nextPassword);
      router.replace("/dashboard");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to sign in";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function fill(account: { email: string; password: string }) {
    setEmail(account.email);
    setPassword(account.password);
    void submit(account.email, account.password);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-zinc-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 md:grid md:grid-cols-2">
        <section className="hidden flex-col justify-between bg-zinc-950 p-8 text-white dark:bg-black md:flex">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-400">
              RestaurantOS
            </p>
            <h2 className="mt-4 text-2xl font-semibold leading-8">
              Run your restaurant from one operational dashboard.
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Orders, tables, menu, inventory, purchasing, expenses, and invoices,
              secured by role based access.
            </p>
          </div>
          <p className="text-xs text-zinc-500">Technical assessment build</p>
        </section>

        <section className="p-8">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">Sign in</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Use a seeded demo account or your credentials.
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(email, password);
            }}
          >
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-300"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-300"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Quick sign in (test accounts)
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {TEST_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  disabled={submitting}
                  onClick={() => fill(account)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-left text-sm text-zinc-800 transition hover:border-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-400 dark:hover:bg-zinc-900 disabled:opacity-60"
                >
                  {account.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              All demo passwords follow the pattern shown after clicking a role.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
