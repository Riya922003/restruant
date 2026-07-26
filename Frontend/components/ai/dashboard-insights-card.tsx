"use client";

import Link from "next/link";
import { aiApi } from "@/lib/ai-api";
import { useApi } from "@/lib/use-api";
import { formatCurrency } from "@/lib/formatters";
import { Card } from "@/components/ui/primitives";
import { RiskPill } from "@/components/ai/recommendation-panel";
import type { PricingResult, ShortageResult } from "@/types/ai";

type Cached<T> = { result: T; generated_at: string };
type DashboardInsights = {
  shortage_prediction?: Cached<ShortageResult>;
  pricing?: Cached<PricingResult>;
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
  const flagged = (pricing?.result.suggestions ?? []).filter(
    (s) => Math.abs(s.suggested_price - s.current_price) >= 0.01,
  );
  const hasAny = Boolean(shortage || pricing);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-base">🤖</span>
          <h2 className="text-sm font-semibold text-zinc-950">AI insights</h2>
        </div>
        <Link href="/dashboard/ai-insights" className="text-xs font-medium text-zinc-600 hover:text-zinc-950">
          Open AI Insights →
        </Link>
      </div>

      {!hasAny ? (
        <p className="py-4 text-sm text-zinc-500">
          No insights generated yet.{" "}
          <Link href="/dashboard/ai-insights" className="font-medium text-zinc-800 underline">
            Generate them
          </Link>{" "}
          to see cached highlights here.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {shortage ? (
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Predicted shortages</p>
                <span className="text-[11px] text-zinc-400">{ago(shortage.generated_at)}</span>
              </div>
              {atRisk.length === 0 ? (
                <p className="text-sm text-zinc-500">No shortages predicted.</p>
              ) : (
                <ul className="space-y-1.5">
                  {atRisk.slice(0, 3).map((r) => (
                    <li key={r.ingredient_id} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-800">{r.name}</span>
                      <span className="flex items-center gap-2 text-zinc-500">
                        {r.days_until_shortage != null ? `${r.days_until_shortage}d` : ""}
                        <RiskPill level={r.risk} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {pricing ? (
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Menu pricing</p>
                <span className="text-[11px] text-zinc-400">{ago(pricing.generated_at)}</span>
              </div>
              <p className="mb-1.5 text-sm text-zinc-600">
                <span className="font-semibold text-zinc-900">{flagged.length}</span> item
                {flagged.length === 1 ? "" : "s"} suggested for repricing
              </p>
              <ul className="space-y-1.5">
                {flagged.slice(0, 3).map((s) => (
                  <li key={s.menu_item_id} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-800">{s.name}</span>
                    <span className="text-zinc-500">
                      {formatCurrency(s.current_price)} → {formatCurrency(s.suggested_price)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
