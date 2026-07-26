"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, humanize } from "@/lib/formatters";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, ErrorState, LoadingState, PageHeader } from "@/components/ui/primitives";
import { DashboardInsightsCard } from "@/components/ai/dashboard-insights-card";

type Range = "7d" | "30d" | "month";

type Summary = {
  range: Range;
  // Financial widgets are omitted by the backend for chef/waiter (spec 10 §11.1).
  sales_overview?: {
    total_sales: number;
    order_count: number;
    average_order_value: number;
    series: { day: string; sales: number; orders: number }[];
  };
  // Operational widgets — present for everyone except cashier (spec 10 §11.1).
  active_orders?: {
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
  table_occupancy?: {
    total: number;
    occupied: number;
    available: number;
    reserved: number;
    out_of_service: number;
    occupancy_pct: number | null;
  };
  low_stock_items?: {
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
  monthly_expenses?: {
    year: number;
    current_month_total: number;
    months: { month: string; total_amount: number; record_count: number }[];
  };
  purchase_summary?: {
    total_po_value: number;
    outstanding_value: number;
    by_status: { status: string; po_count: number; total_value: number }[];
  };
  profit_overview?: {
    total_revenue: number;
    total_cost: number;
    gross_profit: number;
    margin_pct: number | null;
  };
  supplier_summary?: {
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

// Dependency-free bar chart. Each column fills the fixed-height track so the
// per-bar percentage heights actually resolve; hovering reveals the value.
function BarChart({
  data,
  from,
  to,
  format = (v) => String(v),
}: {
  data: { label: string; value: number }[];
  from: string;
  to: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0)
    return <p className="py-16 text-center text-sm text-zinc-400">No data in range.</p>;
  return (
    <div>
      <div className="relative flex h-44 items-end gap-1.5">
        {/* faint gridlines for depth */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-t border-dashed border-zinc-100" />
          ))}
        </div>
        {data.map((d, i) => (
          <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
            <div className="pointer-events-none absolute inset-x-0 -top-1 z-10 mx-auto w-max -translate-y-full rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
              {format(d.value)}
            </div>
            {/* Inline gradient: robust across Tailwind's gradient-utility rename. */}
            <div
              className="w-full rounded-t-md transition-opacity group-hover:opacity-80"
              style={{
                height: `${Math.max(3, (d.value / max) * 100)}%`,
                backgroundImage: `linear-gradient(to top, ${from}, ${to})`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5 border-t border-zinc-100 pt-1.5">
        {data.map((d, i) => (
          <span key={i} className="flex-1 truncate text-center text-[10px] text-zinc-400">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// KPI tile: a tinted icon chip carries the color, the value is the hero, the
// hint sits as a small pill top-right. Less generic than a plain accent rail.
function Metric({
  label,
  value,
  hint,
  icon,
  tint = "bg-zinc-100 text-zinc-600",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: string;
  tint?: string;
}) {
  return (
    <Card className="group p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-base ${tint}`}>
          {icon}
        </span>
        {hint ? (
          <span className="max-w-[60%] truncate rounded-full bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-400 group-hover:text-zinc-500">
            {hint}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{value}</p>
      <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</p>
    </Card>
  );
}

function SectionCard({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  icon?: string;
}) {
  return (
    <Card className="p-5 transition hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {icon ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-base">
              {icon}
            </span>
          ) : null}
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

// Circular initials avatar for supplier rows.
function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const PO_COLORS: Record<string, string> = {
  draft: "#a1a1aa",
  ordered: "#3b82f6",
  partially_received: "#f59e0b",
  received: "#22c55e",
  cancelled: "#ef4444",
};

const ORDER_COLORS: Record<string, string> = {
  open: "#a1a1aa",
  sent_to_kitchen: "#3b82f6",
  preparing: "#f59e0b",
  ready: "#8b5cf6",
  served: "#06b6d4",
};
const ACTIVE_STATUSES = ["open", "sent_to_kitchen", "preparing", "ready", "served"];

// Conic-gradient donut with a legend — used for table occupancy.
function Donut({
  segments,
  centerLabel,
  centerSub,
}: {
  segments: { label: string; value: number; color: string }[];
  centerLabel: string;
  centerSub?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let acc = 0;
  const stops = segments
    .map((s) => {
      const start = (acc / total) * 100;
      acc += s.value;
      const end = (acc / total) * 100;
      return `${s.color} ${start}% ${end}%`;
    })
    .join(", ");
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-32 w-32 shrink-0">
        <div className="h-full w-full rounded-full" style={{ background: `conic-gradient(${stops})` }} />
        <div className="absolute inset-[20%] flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
          <span className="text-xl font-semibold text-zinc-900">{centerLabel}</span>
          {centerSub ? <span className="text-[10px] uppercase tracking-wide text-zinc-400">{centerSub}</span> : null}
        </div>
      </div>
      <ul className="flex-1 space-y-2 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-zinc-600">{s.label}</span>
            <span className="ml-auto font-semibold text-zinc-900">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
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

  // Only management roles have range-dependent (financial) widgets; the range
  // switcher is pointless for cashier/chef/waiter. Backend is the real gate.
  const canSeeFinancials = ["owner", "manager", "store_manager"].includes(user.role);
  const rangeCaption = range === "month" ? "This month" : `Last ${range === "7d" ? "7" : "30"} days`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Welcome, ${user.full_name.split(" ")[0]}`}
        subtitle={canSeeFinancials ? "Live snapshot of sales, operations, and supply" : "Live snapshot of floor operations"}
        actions={
          canSeeFinancials ? (
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
          ) : null
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : data ? (
        <div className="space-y-4">
          {["owner", "manager", "store_manager", "chef"].includes(user.role) ? (
            <DashboardInsightsCard />
          ) : null}

          {/* Headline stats — operational first, then financial (role-gated) */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {data.table_occupancy ? (
              <Metric
                label="Occupancy"
                icon="🪑"
                tint="bg-blue-50 text-blue-600"
                value={`${data.table_occupancy.occupancy_pct ?? 0}%`}
                hint={`${data.table_occupancy.occupied}/${data.table_occupancy.total} tables`}
              />
            ) : null}
            {data.active_orders ? (
              <Metric
                label="Active orders"
                icon="🧾"
                tint="bg-violet-50 text-violet-600"
                value={data.active_orders.active_count}
                hint="in progress"
              />
            ) : null}
            {data.low_stock_items ? (
              <Metric
                label="Low stock"
                icon="📦"
                tint="bg-red-50 text-red-600"
                value={data.low_stock_items.low_stock_count}
                hint="below reorder"
              />
            ) : null}
            {data.sales_overview ? (
              <>
                <Metric
                  label="Sales"
                  icon="💰"
                  tint="bg-emerald-50 text-emerald-600"
                  value={formatCurrency(data.sales_overview.total_sales)}
                  hint={`${data.sales_overview.order_count} paid`}
                />
                <Metric
                  label="Avg order"
                  icon="🧮"
                  tint="bg-teal-50 text-teal-600"
                  value={formatCurrency(data.sales_overview.average_order_value)}
                  hint="per order"
                />
              </>
            ) : null}
            {data.profit_overview ? (
              <Metric
                label="Gross profit"
                icon="📈"
                tint="bg-green-50 text-green-600"
                value={formatCurrency(data.profit_overview.gross_profit)}
                hint={`${data.profit_overview.margin_pct ?? 0}% margin`}
              />
            ) : null}
            {data.purchase_summary ? (
              <Metric
                label="Open POs"
                icon="🛒"
                tint="bg-amber-50 text-amber-600"
                value={formatCurrency(data.purchase_summary.outstanding_value)}
                hint="not received"
              />
            ) : null}
            {data.supplier_summary ? (
              <Metric
                label="Payables"
                icon="💸"
                tint="bg-rose-50 text-rose-600"
                value={formatCurrency(data.supplier_summary.outstanding_invoice_total)}
                hint="unpaid"
              />
            ) : null}
          </div>

          {/* Operational charts — floor view (chef/waiter/cashier + management) */}
          {data.table_occupancy || data.active_orders ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {data.table_occupancy ? (
                <SectionCard title="Table occupancy" icon="🪑">
                  <Donut
                    centerLabel={`${data.table_occupancy.occupancy_pct ?? 0}%`}
                    centerSub="occupied"
                    segments={[
                      { label: "Occupied", value: data.table_occupancy.occupied, color: "#f59e0b" },
                      { label: "Available", value: data.table_occupancy.available, color: "#22c55e" },
                      { label: "Reserved", value: data.table_occupancy.reserved, color: "#3b82f6" },
                      { label: "Out of service", value: data.table_occupancy.out_of_service, color: "#ef4444" },
                    ]}
                  />
                </SectionCard>
              ) : null}
              {data.active_orders ? (
                <SectionCard title="Kitchen queue" icon="🍳">
                  {(() => {
                    const orders = data.active_orders!.orders;
                    const rows = ACTIVE_STATUSES.map((st) => ({
                      st,
                      n: orders.filter((o) => o.status === st).length,
                    })).filter((r) => r.n > 0);
                    const max = Math.max(1, ...rows.map((r) => r.n));
                    if (rows.length === 0)
                      return <p className="py-8 text-center text-sm text-zinc-400">No active orders.</p>;
                    return (
                      <ul className="space-y-3.5 py-1">
                        {rows.map(({ st, n }) => (
                          <li key={st} className="flex items-center gap-3">
                            <span className="w-32 shrink-0">
                              <StatusBadge kind="order" value={st} />
                            </span>
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${(n / max) * 100}%`, backgroundColor: ORDER_COLORS[st] }}
                              />
                            </div>
                            <span className="w-6 shrink-0 text-right text-sm font-semibold text-zinc-900">{n}</span>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </SectionCard>
              ) : null}
            </div>
          ) : null}

          {/* Sales trend + monthly expenses (financial) */}
          {data.sales_overview && data.monthly_expenses ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard
              title="Sales trend"
              icon="📈"
              action={<span className="text-xs text-zinc-400">{rangeCaption}</span>}
            >
              <p className="mb-1 text-2xl font-semibold text-zinc-950">
                {formatCurrency(data.sales_overview.total_sales)}
              </p>
              <p className="mb-4 text-xs text-zinc-400">
                across {data.sales_overview.series.length}{" "}
                {data.sales_overview.series.length === 1 ? "day" : "days"} with sales
              </p>
              <BarChart
                from="#059669"
                to="#6ee7b7"
                format={formatCurrency}
                data={data.sales_overview.series.map((s) => ({
                  label: new Date(s.day).getDate().toString(),
                  value: s.sales,
                }))}
              />
            </SectionCard>
            <SectionCard
              title={`Monthly expenses · ${data.monthly_expenses.year}`}
              icon="💸"
              action={<span className="text-xs text-zinc-400">This month</span>}
            >
              <p className="mb-4 text-2xl font-semibold text-zinc-950">
                {formatCurrency(data.monthly_expenses.current_month_total)}
              </p>
              <BarChart
                from="#d97706"
                to="#fcd34d"
                format={formatCurrency}
                data={data.monthly_expenses.months.map((m) => ({
                  label: MONTH_LABEL(m.month),
                  value: m.total_amount,
                }))}
              />
            </SectionCard>
          </div>
          ) : null}

          {/* Active orders + low stock tables (floor roles) */}
          {data.active_orders || data.low_stock_items ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.active_orders ? (
            <SectionCard title={`Active orders (${data.active_orders.active_count})`} icon="🧾">
              {data.active_orders.orders.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-400">No active orders.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                        <th className="pb-2 pr-3 font-medium">Order</th>
                        <th className="pb-2 pr-3 font-medium">Table</th>
                        <th className="pb-2 pr-3 text-right font-medium">Amount</th>
                        <th className="pb-2 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.active_orders.orders.slice(0, 6).map((o) => (
                        <tr key={o.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                          <td className="py-2.5 pr-3">
                            <span className="block font-medium text-zinc-900">{o.order_number}</span>
                            <span className="text-xs text-zinc-400">{humanize(o.order_type)}</span>
                          </td>
                          <td className="py-2.5 pr-3 text-zinc-600">{o.table_label ?? "—"}</td>
                          <td className="py-2.5 pr-3 text-right font-semibold text-zinc-900">{formatCurrency(o.total)}</td>
                          <td className="py-2.5 text-right">
                            <StatusBadge kind="order" value={o.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
            ) : null}

            {data.low_stock_items ? (
            <SectionCard
              title={`Low stock (${data.low_stock_items.low_stock_count})`}
              icon="📦"
              action={<Link href="/dashboard/inventory" className="text-xs font-medium text-zinc-500 hover:text-zinc-900">View inventory</Link>}
            >
              {data.low_stock_items.items.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-400">Everything is above reorder level.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                        <th className="pb-2 pr-3 font-medium">Item</th>
                        <th className="pb-2 pr-3 font-medium">Type</th>
                        <th className="pb-2 pr-3 font-medium">Level</th>
                        <th className="pb-2 text-right font-medium">Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.low_stock_items.items.slice(0, 6).map((it) => {
                        const ratio = Math.min(1, it.current_stock / (it.reorder_level || 1));
                        const barColor = ratio < 0.4 ? "#ef4444" : "#f59e0b";
                        return (
                          <tr key={`${it.source}-${it.id}`} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                            <td className="py-2.5 pr-3">
                              <span className="block max-w-[9rem] truncate font-medium text-zinc-900">{it.name}</span>
                            </td>
                            <td className="py-2.5 pr-3">
                              <Badge tone={it.source === "ingredient" ? "violet" : "cyan"}>{it.source}</Badge>
                            </td>
                            <td className="py-2.5 pr-3">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${Math.max(4, ratio * 100)}%`, backgroundColor: barColor }}
                                />
                              </div>
                            </td>
                            <td className="py-2.5 text-right text-xs font-semibold" style={{ color: barColor }}>
                              {it.current_stock} / {it.reorder_level} {it.unit}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
            ) : null}
          </div>
          ) : null}

          {/* Purchase summary + supplier summary (financial) */}
          {data.purchase_summary && data.supplier_summary ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Purchase orders" icon="🛒">
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">Total value</p>
                  <p className="mt-0.5 text-lg font-semibold text-zinc-900">{formatCurrency(data.purchase_summary.total_po_value)}</p>
                </div>
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-xs text-amber-700">Outstanding</p>
                  <p className="mt-0.5 text-lg font-semibold text-amber-900">{formatCurrency(data.purchase_summary.outstanding_value)}</p>
                </div>
              </div>
              {data.purchase_summary.by_status.length === 0 ? (
                <p className="py-2 text-center text-sm text-zinc-400">No purchase orders in range.</p>
              ) : (
                <>
                  {(() => {
                    const totalCount = data.purchase_summary!.by_status.reduce((a, s) => a + s.po_count, 0) || 1;
                    return (
                      <div className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-zinc-100">
                        {data.purchase_summary.by_status.map((s) => (
                          <div
                            key={s.status}
                            style={{ width: `${(s.po_count / totalCount) * 100}%`, backgroundColor: PO_COLORS[s.status] ?? "#a1a1aa" }}
                            title={`${humanize(s.status)}: ${s.po_count}`}
                          />
                        ))}
                      </div>
                    );
                  })()}
                  <ul className="space-y-1.5">
                    {data.purchase_summary.by_status.map((s) => (
                      <li key={s.status} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PO_COLORS[s.status] ?? "#a1a1aa" }} />
                          <span className="text-zinc-700">{humanize(s.status)}</span>
                        </span>
                        <span className="text-zinc-500">
                          <span className="font-medium text-zinc-700">{s.po_count}</span> · {formatCurrency(s.total_value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </SectionCard>

            <SectionCard
              title={`Top suppliers · ${data.supplier_summary.active_supplier_count} active`}
              icon="🚚"
              action={<Link href="/dashboard/suppliers" className="text-xs font-medium text-zinc-500 hover:text-zinc-900">View all</Link>}
            >
              {data.supplier_summary.top_suppliers.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-400">No supplier spend in range.</p>
              ) : (
                (() => {
                  const maxSpend = Math.max(...data.supplier_summary!.top_suppliers.map((s) => s.total_spend), 1);
                  return (
                    <ul className="space-y-3.5">
                      {data.supplier_summary.top_suppliers.map((s) => (
                        <li key={s.id} className="flex items-center gap-3">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                            style={{ backgroundImage: "linear-gradient(135deg, #3f3f46, #18181b)" }}
                          >
                            {initials(s.name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm text-zinc-900">{s.name}</span>
                              <span className="shrink-0 text-sm font-semibold text-zinc-900">{formatCurrency(s.total_spend)}</span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                                <div className="h-full rounded-full bg-zinc-800" style={{ width: `${(s.total_spend / maxSpend) * 100}%` }} />
                              </div>
                              <span className="shrink-0 text-xs text-zinc-400">{s.invoice_count} inv</span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  );
                })()
              )}
            </SectionCard>
          </div>
          ) : null}

          {/* Profit overview (financial) */}
          {data.profit_overview ? (
          <SectionCard title="Profit overview" icon="📊">
            {(() => {
              const p = data.profit_overview!;
              const rev = p.total_revenue || 1;
              const profitPct = Math.max(0, (p.gross_profit / rev) * 100);
              const cogsPct = Math.max(0, (p.total_cost / rev) * 100);
              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-zinc-500">Revenue</p>
                      <p className="text-3xl font-semibold text-zinc-950">{formatCurrency(p.total_revenue)}</p>
                    </div>
                    <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                      {p.margin_pct ?? 0}% margin
                    </span>
                  </div>

                  {/* Composition: gross profit vs COGS as a share of revenue */}
                  <div className="flex h-3.5 overflow-hidden rounded-full bg-zinc-100">
                    <div style={{ width: `${profitPct}%`, backgroundColor: "#16a34a" }} title="Gross profit" />
                    <div style={{ width: `${cogsPct}%`, backgroundColor: "#d4d4d8" }} title="COGS" />
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <div className="rounded-lg bg-green-50 p-3">
                      <p className="flex items-center gap-1.5 text-xs text-green-700">
                        <span className="h-2 w-2 rounded-full bg-green-600" /> Gross profit
                      </p>
                      <p className="mt-1 text-lg font-semibold text-green-800">{formatCurrency(p.gross_profit)}</p>
                    </div>
                    <div className="rounded-lg bg-zinc-50 p-3">
                      <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <span className="h-2 w-2 rounded-full bg-zinc-300" /> COGS
                      </p>
                      <p className="mt-1 text-lg font-semibold text-zinc-800">{formatCurrency(p.total_cost)}</p>
                    </div>
                    <div className="rounded-lg bg-zinc-50 p-3">
                      <p className="text-xs text-zinc-500">Margin</p>
                      <p className="mt-1 text-lg font-semibold text-zinc-800">{p.margin_pct ?? 0}%</p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </SectionCard>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
