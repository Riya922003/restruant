"use client";

import Link from "next/link";
import { aiApi } from "@/lib/ai-api";
import { useApi } from "@/lib/use-api";
import { formatCurrency } from "@/lib/formatters";
import { Card } from "@/components/ui/primitives";
import type { PricingResult, ShortageResult } from "@/types/ai";

type Cached<T> = { result: T; generated_at: string };
type DashboardInsights = {
  shortage_prediction?: Cached<ShortageResult>;
  pricing?: Cached<PricingResult>;
};

const RISK_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};
const RISK_PILL: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-emerald-100 text-emerald-700",
};

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function DashboardInsightsCard() {
  const { data, loading } = useApi(
    () => aiApi.get<DashboardInsights>("/ai/insights/dashboard"),
    [],
  );
  if (loading) return null;

  const shortage = data?.shortage_prediction;
  const pricing = data?.pricing;
  const atRisk = shortage?.result.at_risk ?? [];

  // Only surface pricing changes that actually matter (>= Rs.1 and >= 1% of price),
  // ranked by impact. The model often echoes near-identical prices, which is noise.
  const reprices = (pricing?.result.suggestions ?? [])
    .map((s) => ({ ...s, delta: s.suggested_price - s.current_price }))
    .filter((s) => Math.abs(s.delta) >= Math.max(1, s.current_price * 0.01))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const hasAny = Boolean(shortage || pricing);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg text-base text-white"
            style={{ backgroundImage: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            ✨
          </span>
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">AI insights</h2>
            <p className="text-[11px] text-zinc-400">Cached from your last run</p>
          </div>
        </div>
        <Link
          href="/dashboard/ai-insights"
          className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
        >
          Generate AI insights
        </Link>
      </div>

      {!hasAny ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-zinc-500">
            No insights generated yet.{" "}
            <Link href="/dashboard/ai-insights" className="font-medium text-zinc-800 underline">
              Generate them
            </Link>{" "}
            to see highlights here.
          </p>
        </div>
      ) : (
        <div className="grid divide-y divide-zinc-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {/* Shortages */}
          {shortage ? (
            <section className="px-5 py-4">
              <SectionHead icon="📉" label="Predicted shortages" when={ago(shortage.generated_at)} />
              {atRisk.length === 0 ? (
                <Positive text="No shortages predicted." />
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {atRisk.slice(0, 3).map((r) => (
                    <li key={r.ingredient_id} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${RISK_DOT[r.risk] ?? RISK_DOT.low}`} />
                        <span className="truncate text-sm font-medium text-zinc-800">{r.name}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {r.days_until_shortage != null ? (
                          <span className="text-xs tabular-nums text-zinc-500">in {r.days_until_shortage}d</span>
                        ) : null}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${RISK_PILL[r.risk] ?? RISK_PILL.low}`}>
                          {r.risk}
                        </span>
                      </span>
                    </li>
                  ))}
                  {atRisk.length > 3 ? (
                    <li className="pt-0.5 text-xs text-zinc-400">+{atRisk.length - 3} more at risk</li>
                  ) : null}
                </ul>
              )}
            </section>
          ) : null}

          {/* Pricing */}
          {pricing ? (
            <section className="px-5 py-4">
              <SectionHead icon="💰" label="Menu pricing" when={ago(pricing.generated_at)} />
              {reprices.length === 0 ? (
                <Positive text="Menu is well-priced — no changes needed." />
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {reprices.slice(0, 3).map((s) => (
                    <li key={s.menu_item_id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-zinc-800">{s.name}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                        <span className="text-zinc-400">{formatCurrency(s.current_price)}</span>
                        <span className={s.delta > 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
                          {s.delta > 0 ? "↑" : "↓"} {formatCurrency(s.suggested_price)}
                        </span>
                      </span>
                    </li>
                  ))}
                  {reprices.length > 3 ? (
                    <li className="pt-0.5 text-xs text-zinc-400">+{reprices.length - 3} more suggested</li>
                  ) : null}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function SectionHead({ icon, label, when }: { icon: string; label: string; when: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <span aria-hidden>{icon}</span>
        {label}
      </span>
      <span className="text-[11px] text-zinc-400">{when}</span>
    </div>
  );
}

function Positive({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✅ {text}</p>
  );
}
