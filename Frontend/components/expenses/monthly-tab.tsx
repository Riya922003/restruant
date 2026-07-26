"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Card, EmptyState, ErrorState, LoadingState, StatCard } from "@/components/ui/primitives";
import { Select } from "@/components/ui/field";
import { formatCurrency, formatDate } from "@/lib/formatters";

type ByCategory = {
  category_id: number;
  category_name: string;
  total_amount: number;
  record_count: number;
};
type MonthRow = {
  month: string;
  total_amount: number;
  record_count: number;
  by_category: ByCategory[];
};
type MonthlyMeta = { year: number; total_amount: number };

const NOW = new Date().getFullYear();
const YEARS = [NOW, NOW - 1, NOW - 2];

export function MonthlyTab() {
  const [year, setYear] = useState(String(NOW));
  const { data, loading, error, refetch } = useApi(
    () => api.list<MonthRow>(`/expenses/monthly?year=${year}`),
    [year]
  );

  const meta = data?.meta as unknown as MonthlyMeta | undefined;
  const rows = data?.data ?? [];
  const maxTotal = rows.reduce((m, r) => Math.max(m, Number(r.total_amount ?? 0)), 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={year} onChange={(e) => setYear(e.target.value)} className="max-w-40">
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState title="No expenses for this year" />
      ) : (
        <div className="space-y-4">
          <StatCard label={`Total for ${meta?.year ?? year}`} value={formatCurrency(meta?.total_amount ?? 0)} />

          <div className="grid gap-4 sm:grid-cols-2">
            {rows.map((r) => (
              <Card key={r.month} className="p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-sm font-semibold text-zinc-900">{formatDate(r.month)}</p>
                  <p className="text-sm font-medium text-zinc-950">{formatCurrency(r.total_amount)}</p>
                </div>
                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-zinc-900"
                    style={{ width: `${maxTotal > 0 ? (Number(r.total_amount) / maxTotal) * 100 : 0}%` }}
                  />
                </div>
                <p className="mb-2 text-xs text-zinc-500">{r.record_count} records</p>
                {r.by_category.length > 0 ? (
                  <table className="w-full text-sm">
                    <tbody>
                      {r.by_category.map((c) => (
                        <tr key={c.category_id} className="border-t border-zinc-100">
                          <td className="py-1.5 text-zinc-700">{c.category_name}</td>
                          <td className="py-1.5 text-right text-zinc-500">{c.record_count}</td>
                          <td className="py-1.5 text-right font-medium text-zinc-900">
                            {formatCurrency(c.total_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-xs text-zinc-400">No category breakdown</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
