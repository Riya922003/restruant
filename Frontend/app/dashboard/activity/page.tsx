"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { humanize } from "@/lib/formatters";
import { Card, ErrorState, LoadingState, PageHeader } from "@/components/ui/primitives";

type AuditLog = {
  id: number;
  actor_user_id: number | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type Facets = { actions: string[]; entity_types: string[] };

type Filters = { action: string; entity_type: string; from: string; to: string };
const EMPTY: Filters = { action: "", entity_type: "", from: "", to: "" };

// Color the verb (the part after the dot) so the log scans quickly.
function verbTone(action: string): string {
  const verb = action.split(".")[1] ?? "";
  if (/(created|approved|received|generated|taken|imported)/.test(verb)) return "bg-emerald-100 text-emerald-700";
  if (/(updated|changed|corrected|renamed|adjusted|moved|reset)/.test(verb)) return "bg-amber-100 text-amber-800";
  if (/(deleted|deactivated|cancelled|rejected|failed)/.test(verb)) return "bg-red-100 text-red-700";
  return "bg-zinc-100 text-zinc-600";
}

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function MetaChips({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata || Object.keys(metadata).length === 0) return <span className="text-zinc-300">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(metadata).map(([k, v]) => (
        <span key={k} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600">
          {humanize(k)}: <span className="font-medium text-zinc-800">{Array.isArray(v) ? v.join(", ") : String(v)}</span>
        </span>
      ))}
    </div>
  );
}

const inputCls =
  "rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-800 focus:border-zinc-400 focus:outline-none";

export default function ActivityPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);

  const { data: facets } = useApi<Facets>(() => api.get<Facets>("/audit-logs/facets"), []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("limit", "25");
    p.set("sort", "-created_at");
    if (filters.action) p.set("action", filters.action);
    if (filters.entity_type) p.set("entity_type", filters.entity_type);
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", filters.to);
    return p.toString();
  }, [filters, page]);

  const { data, loading, error, refetch } = useApi(
    () => api.list<AuditLog>(`/audit-logs?${query}`),
    [query],
  );

  const set = (patch: Partial<Filters>) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...patch }));
  };

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const hasFilters = filters.action || filters.entity_type || filters.from || filters.to;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Activity log"
        subtitle="Every create, update, and delete across the app, plus AI invoice events."
      />

      {/* Filters */}
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <select className={inputCls} value={filters.action} onChange={(e) => set({ action: e.target.value })}>
          <option value="">All actions</option>
          {facets?.actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select className={inputCls} value={filters.entity_type} onChange={(e) => set({ entity_type: e.target.value })}>
          <option value="">All entities</option>
          {facets?.entity_types.map((t) => (
            <option key={t} value={t}>{humanize(t)}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          From
          <input type="date" className={inputCls} value={filters.from} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          To
          <input type="date" className={inputCls} value={filters.to} onChange={(e) => set({ to: e.target.value })} />
        </label>
        {hasFilters ? (
          <button
            onClick={() => { setPage(1); setFilters(EMPTY); }}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
          >
            Clear
          </button>
        ) : null}
        <span className="ml-auto text-xs text-zinc-400">{meta ? `${meta.total} events` : ""}</span>
      </Card>

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Actor</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">Target</th>
                  <th className="px-4 py-2.5 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-400">
                      No activity {hasFilters ? "matches these filters" : "yet"}.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                      <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500" title={new Date(r.created_at).toLocaleString()}>
                        {ago(r.created_at)}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.actor_name || r.actor_email ? (
                          <span className="font-medium text-zinc-800">{r.actor_name ?? r.actor_email}</span>
                        ) : (
                          <span className="text-zinc-400">System</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${verbTone(r.action)}`} title={r.action}>
                          {r.action}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-zinc-600">
                        {r.entity_type ? (
                          <>
                            {humanize(r.entity_type)}
                            {r.entity_id != null ? <span className="text-zinc-400"> #{r.entity_id}</span> : null}
                          </>
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <MetaChips metadata={r.metadata} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-sm">
              <span className="text-zinc-500">
                Page {meta.page} of {meta.totalPages}
              </span>
              <div className="flex gap-1.5">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition enabled:hover:border-zinc-300 enabled:hover:text-zinc-900 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition enabled:hover:border-zinc-300 enabled:hover:text-zinc-900 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
