"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { navForRole } from "@/lib/navigation";
import { formatCurrency, formatDate, humanize } from "@/lib/formatters";
import { Badge, StatusBadge } from "@/components/ui/badge";
import {
  Card,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
} from "@/components/ui/primitives";

type Range = "7d" | "30d" | "month";

type Summary = {
  range: Range;
  sales_overview: {
    total_sales: number;
    order_count: number;
    average_order_value: number;
    series: { day: string; sales: number; orders: number }[];
  };
  active_orders: {
    active_count: number;
    orders: {
      id: number;
      order_number: string;
      status: string;
      order_type: string;
      total: number;
      table_label: string | null;
      created_at: string;
    }[];
  };
  table_occupancy: {
    total: number;
    occupied: number;
    available: number;
    reserved: number;
    out_of_service: number;
    occupancy_pct: number | null;
  };
  low_stock_items: {
    low_stock_count: number;
    items: {
      source: string;
      id: number;
      name: string;
      sku: string | null;
      current_stock: number;
      reorder_level: number;
      unit: string;
    }[];
  };
  monthly_expenses: {
    year: number;
    current_month_total: number;
    months: { month: string; total_amount: number; record_count: number }[];
  };
  purchase_summary: {
    total_po_value: number;
    outstanding_value: number;
    by_status: { status: string; po_count: number; total_value: number }[];
  };
  profit_overview: {
    total_revenue: number;
    total_cost: number;
    gross_profit: number;
    margin_pct: number | null;
  };
  supplier_summary: {
    active_supplier_count: number;
    outstanding_invoice_total: number;
    top_suppliers: { id: number; name: string; total_spend: number; invoice_count: number }[];
  };
};

const RANGES: { value: Range; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "month", label: "This month" },
];

const MONTH_LABEL = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { month: "short" });

// Minimal dependency-free bar chart.
function Bars({ data, color = "bg-zinc-900" }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="text-sm text-zinc-400">No data in range.</p>;
  return (
    <div className="flex h-40 items-end gap-1">
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${d.label}: ${d.value}`}>
          <div
            className={`w-full rounded-t ${color}`}
            style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
          />
          <span className="truncate text-[10px] text-zinc-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [range, setRange] = useState<Range>("30d");
  const { data, loading, error, refetch } = useApi(
    () => api.get<Summary>(`/dashboard/summary?range=${range}`),
    [range]
  );

  if (!user) return null;
  const tiles = navForRole(user.role).filter((item) => item.href !== "/dashboard");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Welcome, ${user.full_name.split(" ")[0]}`}
        subtitle="Live snapshot of sales, operations, and supply"
        actions={
          <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  range === r.value ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : data ? (
        <div className="space-y-4">
          {/* Headline stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Sales"
              value={formatCurrency(data.sales_overview.total_sales)}
              hint={`${data.sales_overview.order_count} paid orders`}
            />
            <StatCard
              label="Avg order value"
              value={formatCurrency(data.sales_overview.average_order_value)}
            />
            <StatCard
              label="Gross profit"
              value={formatCurrency(data.profit_overview.gross_profit)}
              hint={`${data.profit_overview.margin_pct ?? 0}% margin`}
            />
            <StatCard
              label="Occupancy"
              value={`${data.table_occupancy.occupancy_pct ?? 0}%`}
              hint={`${data.table_occupancy.occupied}/${data.table_occupancy.total} tables`}
            />
            <StatCard label="Active orders" value={data.active_orders.active_count} />
            <StatCard
              label="Low stock"
              value={data.low_stock_items.low_stock_count}
              hint="at/below reorder level"
            />
            <StatCard
              label="Open PO value"
              value={formatCurrency(data.purchase_summary.outstanding_value)}
              hint="ordered, not received"
            />
            <StatCard
              label="Payables"
              value={formatCurrency(data.supplier_summary.outstanding_invoice_total)}
              hint="unpaid invoices"
            />
          </div>

          {/* Sales trend + monthly expenses */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Sales trend">
              <Bars
                data={data.sales_overview.series.map((s) => ({
                  label: new Date(s.day).getDate().toString(),
                  value: s.sales,
                }))}
              />
            </SectionCard>
            <SectionCard title={`Monthly expenses · ${data.monthly_expenses.year}`}>
              <Bars
                color="bg-amber-500"
                data={data.monthly_expenses.months.map((m) => ({
                  label: MONTH_LABEL(m.month),
                  value: m.total_amount,
                }))}
              />
            </SectionCard>
          </div>

          {/* Active orders + low stock */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title={`Active orders (${data.active_orders.active_count})`}>
              {data.active_orders.orders.length === 0 ? (
                <p className="text-sm text-zinc-400">No active orders.</p>
              ) : (
                <div className="space-y-2">
                  {data.active_orders.orders.slice(0, 6).map((o) => (
                    <div key={o.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium text-zinc-900">{o.order_number}</span>
                        <span className="ml-2 text-zinc-500">{o.table_label ?? humanize(o.order_type)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-600">{formatCurrency(o.total)}</span>
                        <StatusBadge kind="order" value={o.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title={`Low stock (${data.low_stock_items.low_stock_count})`}
              action={<Link href="/dashboard/inventory" className="text-xs text-zinc-500 hover:text-zinc-900">View inventory</Link>}
            >
              {data.low_stock_items.items.length === 0 ? (
                <p className="text-sm text-zinc-400">Everything is above reorder level.</p>
              ) : (
                <div className="space-y-2">
                  {data.low_stock_items.items.slice(0, 6).map((it) => (
                    <div key={`${it.source}-${it.id}`} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Badge tone={it.source === "ingredient" ? "violet" : "cyan"}>{it.source}</Badge>
                        <span className="text-zinc-900">{it.name}</span>
                      </div>
                      <span className="text-red-700">
                        {it.current_stock} / {it.reorder_level} {it.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Purchase summary + supplier summary */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Purchase orders">
              <p className="mb-3 text-sm text-zinc-600">
                Total value <span className="font-semibold text-zinc-900">{formatCurrency(data.purchase_summary.total_po_value)}</span>
                <span className="mx-2 text-zinc-300">·</span>
                Outstanding <span className="font-semibold text-zinc-900">{formatCurrency(data.purchase_summary.outstanding_value)}</span>
              </p>
              {data.purchase_summary.by_status.length === 0 ? (
                <p className="text-sm text-zinc-400">No purchase orders in range.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.purchase_summary.by_status.map((s) => (
                    <div key={s.status} className="flex items-center justify-between text-sm">
                      <StatusBadge kind="purchase_order" value={s.status} />
                      <span className="text-zinc-600">
                        {s.po_count} · {formatCurrency(s.total_value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title={`Top suppliers · ${data.supplier_summary.active_supplier_count} active`}
              action={<Link href="/dashboard/suppliers" className="text-xs text-zinc-500 hover:text-zinc-900">View all</Link>}
            >
              {data.supplier_summary.top_suppliers.length === 0 ? (
                <p className="text-sm text-zinc-400">No supplier spend in range.</p>
              ) : (
                <div className="space-y-2">
                  {data.supplier_summary.top_suppliers.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-900">{s.name}</span>
                      <span className="text-zinc-600">
                        {formatCurrency(s.total_spend)} <span className="text-zinc-400">({s.invoice_count})</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Profit breakdown */}
          <SectionCard title="Profit overview">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Revenue</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">{formatCurrency(data.profit_overview.total_revenue)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">COGS</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">{formatCurrency(data.profit_overview.total_cost)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Gross profit</p>
                <p className="mt-1 text-lg font-semibold text-green-700">{formatCurrency(data.profit_overview.gross_profit)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Margin</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">{data.profit_overview.margin_pct ?? 0}%</p>
              </div>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {/* Quick module access */}
      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-zinc-500">Your modules</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-900 hover:shadow-sm"
          >
            <p className="text-sm font-semibold text-zinc-900 group-hover:text-zinc-950">{item.label}</p>
            <p className="mt-0.5 text-xs text-zinc-500">Open {item.label.toLowerCase()}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
