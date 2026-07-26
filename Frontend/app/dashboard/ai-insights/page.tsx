"use client";

import { aiApi } from "@/lib/ai-api";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/formatters";
import { PageHeader } from "@/components/ui/primitives";
import { RecommendationPanel, RiskPill } from "@/components/ai/recommendation-panel";
import type {
  PrepTimeResult,
  PricingResult,
  ReorderResult,
  ShortageResult,
  WasteResult,
} from "@/types/ai";

const th = "px-2 py-1.5 text-left text-[11px] uppercase tracking-wide text-zinc-500";
const td = "px-2 py-1.5 text-zinc-700";

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
            run={() => aiApi.post<ShortageResult>("/ai/inventory/shortage-prediction", { horizon_days: 7 })}
            render={(d) =>
              d.at_risk.length === 0 ? (
                <p className="text-sm text-zinc-500">No shortages predicted in the next 7 days.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={th}>Ingredient</th>
                      <th className={th}>Stock</th>
                      <th className={th}>Days left</th>
                      <th className={th}>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.at_risk.map((r) => (
                      <tr key={r.ingredient_id} className="border-t border-zinc-100">
                        <td className={`${td} font-medium text-zinc-900`}>{r.name}</td>
                        <td className={td}>{r.current_stock} {r.unit}</td>
                        <td className={td}>{r.days_until_shortage ?? "-"}</td>
                        <td className={td}><RiskPill level={r.risk} /></td>
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
            run={() => aiApi.post<ReorderResult>("/ai/inventory/reorder-suggestion", { cover_days: 14, scope: "both" })}
            render={(d) =>
              d.recommendations.length === 0 ? (
                <p className="text-sm text-zinc-500">Everything is well stocked.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={th}>Item</th>
                      <th className={th}>Order</th>
                      <th className={th}>Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.recommendations.map((r) => (
                      <tr key={`${r.item_type}-${r.item_id}`} className="border-t border-zinc-100">
                        <td className={`${td} font-medium text-zinc-900`}>{r.name}</td>
                        <td className={td}>{r.suggested_order_qty} {r.unit}</td>
                        <td className={td}>{formatCurrency(r.estimated_cost)}</td>
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
            run={() => aiApi.post<PricingResult>("/ai/menu/pricing-suggestion", { target_margin_pct: 65 })}
            render={(d) => (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>Item</th>
                    <th className={th}>Current</th>
                    <th className={th}>Suggested</th>
                    <th className={th}>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {d.suggestions.slice(0, 12).map((r) => (
                    <tr key={r.menu_item_id} className="border-t border-zinc-100">
                      <td className={`${td} font-medium text-zinc-900`}>{r.name}</td>
                      <td className={td}>{formatCurrency(r.current_price)}</td>
                      <td className={td}>{formatCurrency(r.suggested_price)}</td>
                      <td className={td}>{r.suggested_margin_pct}%</td>
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
            run={() => aiApi.post<PrepTimeResult>("/ai/menu/prep-time-estimate", {})}
            render={(d) => (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>Item</th>
                    <th className={th}>Current</th>
                    <th className={th}>Estimate</th>
                    <th className={th}>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {d.estimates.slice(0, 12).map((r) => (
                    <tr key={r.menu_item_id} className="border-t border-zinc-100">
                      <td className={`${td} font-medium text-zinc-900`}>{r.name}</td>
                      <td className={td}>{r.existing_prep_time_minutes ?? "-"} min</td>
                      <td className={td}>{r.estimated_prep_time_minutes} min</td>
                      <td className={td}>{r.confidence}</td>
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
            run={() => aiApi.post<WasteResult>("/ai/inventory/waste-analysis", { window_days: 30 })}
            render={(d) =>
              d.top_waste.length === 0 ? (
                <p className="text-sm text-zinc-500">No wastage recorded in the last 30 days.</p>
              ) : (
                <div>
                  <p className="mb-2 text-sm text-zinc-600">
                    Total waste: <span className="font-semibold text-zinc-900">{formatCurrency(d.total_waste_value)}</span>
                  </p>
                  <ul className="space-y-2">
                    {d.top_waste.slice(0, 5).map((r) => (
                      <li key={r.item_id} className="rounded-lg border border-zinc-100 p-2.5">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-zinc-900">{r.name}</span>
                          <span className="text-zinc-700">{formatCurrency(r.wasted_value)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-500">{r.recommendation}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            }
          />
        )}
      </div>
    </div>
  );
}
