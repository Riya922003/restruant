"use client";

import { aiApi } from "@/lib/ai-api";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/formatters";
import { PageHeader } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import {
  ConfidencePill,
  MiniBar,
  NUM,
  RecommendationPanel,
  RiskPill,
  TD,
  TH,
} from "@/components/ai/recommendation-panel";
import type {
  PrepTimeResult,
  PricingResult,
  ReorderResult,
  ShortageResult,
  WasteResult,
} from "@/types/ai";

function ItemCell({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-zinc-900">{name}</p>
      {sub ? <p className="truncate text-xs text-zinc-400">{sub}</p> : null}
    </div>
  );
}

function PriceDelta({ from, to }: { from: number; to: number }) {
  const d = Math.round((to - from) * 100) / 100;
  if (Math.abs(d) < 0.01) return <span className="text-xs text-zinc-400">no change</span>;
  const up = d > 0;
  return (
    <span className={`text-xs font-medium ${up ? "text-emerald-600" : "text-red-600"}`}>
      {up ? "▲" : "▼"} {formatCurrency(Math.abs(d))}
    </span>
  );
}

export default function AiInsightsPage() {
  const { user } = useAuth();
  const role = user?.role ?? "";
  const can = (roles: string[]) => role === "owner" || roles.includes(role);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="AI Insights"
        subtitle="On-demand recommendations grounded in your live inventory, menu, and sales data."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {can(["manager", "store_manager", "chef"]) && (
          <RecommendationPanel<ShortageResult>
            title="Predicted shortages"
            description="Ingredients likely to run low soon"
            icon="📉"
            tint="bg-red-50 text-red-600"
            run={() => aiApi.post<ShortageResult>("/ai/inventory/shortage-prediction", { horizon_days: 7 })}
            render={(d) =>
              d.at_risk.length === 0 ? (
                <Empty text="No shortages predicted in the next 7 days." good />
              ) : (
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={TH}>Ingredient</th>
                      <th className={`${TH} w-36`}>Stock vs reorder</th>
                      <th className={`${TH} text-right`}>Days</th>
                      <th className={`${TH} text-right`}>Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {d.at_risk.map((r) => (
                      <tr key={r.ingredient_id}>
                        <td className={TD}>
                          <ItemCell name={r.name} sub={r.reason} />
                        </td>
                        <td className={TD}>
                          <span className={`${NUM} text-zinc-800`}>
                            <span className="font-semibold">{r.current_stock}</span>
                            <span className="text-zinc-400"> / {r.reorder_level} {r.unit}</span>
                          </span>
                          <MiniBar
                            value={r.current_stock}
                            max={r.reorder_level || r.current_stock}
                            tone={r.risk === "high" ? "bg-red-500" : r.risk === "medium" ? "bg-amber-500" : "bg-emerald-500"}
                          />
                        </td>
                        <td className={`${TD} ${NUM} text-right font-semibold text-zinc-900`}>
                          {r.days_until_shortage ?? "—"}
                        </td>
                        <td className={`${TD} text-right`}>
                          <RiskPill level={r.risk} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          />
        )}

        {can(["manager", "store_manager"]) && (
          <RecommendationPanel<ReorderResult>
            title="Reorder suggestions"
            description="Quantities to cover the next 14 days"
            icon="🛒"
            tint="bg-blue-50 text-blue-600"
            run={() => aiApi.post<ReorderResult>("/ai/inventory/reorder-suggestion", { cover_days: 14, scope: "both" })}
            render={(d) =>
              d.recommendations.length === 0 ? (
                <Empty text="Everything is well stocked." good />
              ) : (
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={TH}>Item</th>
                      <th className={`${TH} text-right`}>In stock</th>
                      <th className={`${TH} text-right`}>Order</th>
                      <th className={`${TH} text-right`}>Est. cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {d.recommendations.map((r) => (
                      <tr key={`${r.item_type}-${r.item_id}`}>
                        <td className={TD}>
                          <ItemCell name={r.name} sub={r.item_type} />
                        </td>
                        <td className={`${TD} ${NUM} text-right text-zinc-500`}>
                          {r.current_stock} {r.unit}
                        </td>
                        <td className={`${TD} ${NUM} text-right font-semibold text-zinc-900`}>
                          {r.suggested_order_qty} {r.unit}
                        </td>
                        <td className={`${TD} ${NUM} text-right font-semibold text-zinc-900`}>
                          {formatCurrency(r.estimated_cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          />
        )}

        {can(["manager"]) && (
          <RecommendationPanel<PricingResult>
            title="Menu pricing"
            description="Prices vs a 65% target margin"
            icon="💰"
            tint="bg-emerald-50 text-emerald-600"
            run={() => aiApi.post<PricingResult>("/ai/menu/pricing-suggestion", { target_margin_pct: 65 })}
            render={(d) => (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={TH}>Item</th>
                    <th className={`${TH} text-right`}>Current</th>
                    <th className={`${TH} text-right`}>Suggested</th>
                    <th className={`${TH} text-right`}>Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {d.suggestions.slice(0, 12).map((r) => (
                    <tr key={r.menu_item_id}>
                      <td className={TD}>
                        <ItemCell name={r.name} sub={`cost ${formatCurrency(r.unit_cost)}`} />
                      </td>
                      <td className={`${TD} ${NUM} text-right text-zinc-500`}>{formatCurrency(r.current_price)}</td>
                      <td className={`${TD} text-right`}>
                        <div className={`${NUM} font-semibold text-zinc-900`}>{formatCurrency(r.suggested_price)}</div>
                        <PriceDelta from={r.current_price} to={r.suggested_price} />
                      </td>
                      <td className={`${TD} ${NUM} text-right font-medium text-zinc-700`}>{r.suggested_margin_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          />
        )}

        {can(["manager", "chef"]) && (
          <RecommendationPanel<PrepTimeResult>
            title="Prep-time estimates"
            description="Estimated minutes from recipe complexity"
            icon="⏱️"
            tint="bg-violet-50 text-violet-600"
            run={() => aiApi.post<PrepTimeResult>("/ai/menu/prep-time-estimate", {})}
            render={(d) => (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={TH}>Item</th>
                    <th className={`${TH} text-right`}>Current</th>
                    <th className={`${TH} text-right`}>Estimate</th>
                    <th className={`${TH} text-right`}>Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {d.estimates.slice(0, 12).map((r) => (
                    <tr key={r.menu_item_id}>
                      <td className={TD}>
                        <ItemCell name={r.name} sub={r.drivers} />
                      </td>
                      <td className={`${TD} ${NUM} text-right text-zinc-500`}>
                        {r.existing_prep_time_minutes ?? "—"} min
                      </td>
                      <td className={`${TD} ${NUM} text-right font-semibold text-zinc-900`}>
                        {r.estimated_prep_time_minutes} min
                      </td>
                      <td className={`${TD} text-right`}>
                        <ConfidencePill level={r.confidence} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          />
        )}

        {can(["manager", "store_manager", "chef"]) && (
          <RecommendationPanel<WasteResult>
            title="Waste analysis"
            description="Biggest waste by value + how to cut it"
            icon="♻️"
            tint="bg-amber-50 text-amber-600"
            run={() => aiApi.post<WasteResult>("/ai/inventory/waste-analysis", { window_days: 30 })}
            render={(d) =>
              d.top_waste.length === 0 ? (
                <Empty text="No wastage recorded in the last 30 days." good />
              ) : (
                <div>
                  <div className="mb-3 flex items-center justify-between rounded-xl bg-amber-50 px-3.5 py-2.5">
                    <span className="text-xs font-medium uppercase tracking-wide text-amber-700">Total waste (30d)</span>
                    <span className={`${NUM} text-lg font-bold text-amber-700`}>{formatCurrency(d.total_waste_value)}</span>
                  </div>
                  <ul className="space-y-2">
                    {d.top_waste.slice(0, 5).map((r, i) => (
                      <li key={r.item_id} className="rounded-xl border border-zinc-100 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-500">
                              {i + 1}
                            </span>
                            <div>
                              <p className="font-medium text-zinc-900">{r.name}</p>
                              <p className="text-xs text-zinc-400">
                                {r.wasted_qty} {r.unit} wasted
                                {r.waste_pct_of_usage != null ? ` · ${r.waste_pct_of_usage}% of usage` : ""}
                              </p>
                            </div>
                          </div>
                          <span className={`${NUM} shrink-0 font-semibold text-amber-700`}>
                            {formatCurrency(r.wasted_value)}
                          </span>
                        </div>
                        <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
                          💡 {r.recommendation}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            }
          />
        )}
      </div>

      {!can(["manager", "store_manager", "chef"]) ? (
        <div className="mt-4">
          <Badge tone="zinc">Your role has no AI insights.</Badge>
        </div>
      ) : null}
    </div>
  );
}

function Empty({ text, good }: { text: string; good?: boolean }) {
  return (
    <div className={`rounded-xl px-3.5 py-4 text-sm ${good ? "bg-emerald-50 text-emerald-700" : "bg-zinc-50 text-zinc-500"}`}>
      {good ? "✅ " : ""}
      {text}
    </div>
  );
}
