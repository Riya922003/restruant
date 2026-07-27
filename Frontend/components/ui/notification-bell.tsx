"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { humanize } from "@/lib/formatters";

type Item = {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  actor_name: string | null;
  created_at: string;
};
type Feed = { items: Item[]; unread_count: number; seen_at: string | null };

// Bell refreshes on a 30s timer (polling, per the real-time design: the feed is
// not latency-critical, so no socket here).
const POLL_MS = 30000;

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setFeed(await api.get<Feed>("/notifications"));
    } catch {
      // A feed error is non-critical; leave the last state and try again next tick.
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(load, 0);
    const t = setInterval(load, POLL_MS);
    return () => {
      window.clearTimeout(initial);
      clearInterval(t);
    };
  }, [load]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    // Opening clears the unread badge (optimistically) and persists seen_at.
    if (next && feed && feed.unread_count > 0) {
      setFeed({ ...feed, unread_count: 0 });
      try {
        await api.post("/notifications/seen");
      } catch {
        // Non-critical; the next poll will reconcile.
      }
    }
  }

  const unread = feed?.unread_count ?? 0;
  const items = feed?.items ?? [];
  const canSeeAll = user?.role === "owner" || user?.role === "manager";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-4 py-2.5">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Notifications</span>
            {canSeeAll ? (
              <Link
                href="/dashboard/activity"
                className="text-xs text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:text-zinc-500 dark:hover:text-zinc-100"
                onClick={() => setOpen(false)}
              >
                View all
              </Link>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-400 dark:text-zinc-500 dark:text-zinc-500">No recent activity.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-auto">
              {items.map((n) => (
                <li key={n.id} className="px-4 py-2.5">
                  <p className="text-sm text-zinc-800 dark:text-zinc-100">
                    {humanize(n.action.replace(/\./g, " "))}
                    {n.entity_type ? (
                      <span className="text-zinc-400 dark:text-zinc-500">
                        {" "}
                        · {humanize(n.entity_type)}
                        {n.entity_id != null ? ` #${n.entity_id}` : ""}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    {n.actor_name ?? "System"} · {ago(n.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
