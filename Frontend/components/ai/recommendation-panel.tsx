"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { Button, Card } from "@/components/ui/primitives";
import { humanize } from "@/lib/formatters";
import type { AiContext } from "@/types/ai";

// Reusable "generate a suggestion" panel: tinted header + Generate button, skeleton
// loading, empty/error states, a slot to render the result, and an inputs-echo
// footer so users can see the data the suggestion was grounded in (spec 02 s2).
export function RecommendationPanel<T extends { context?: AiContext }>({
  title,
  description,
  icon,
  tint = "bg-zinc-100 text-zinc-700",
  buttonLabel = "Generate",
  run,
  render,
}: {
  title: string;
  description: string;
  icon: string;
  tint?: string;
  buttonLabel?: string;
  run: () => Promise<T>;
  render: (data: T) => React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    try {
      setData(await run());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate suggestion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="flex flex-col p-5 shadow-sm dark:bg-zinc-900/80">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${tint}`}>
            {icon}
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-zinc-950">{title}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
          </div>
        </div>
        <Button size="sm" onClick={go} disabled={loading}>
          {loading ? "Analyzing…" : data ? "Refresh" : buttonLabel}
        </Button>
      </div>

      <div className="mt-4 flex-1">
        {loading ? (
          <Skeleton />
        ) : error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">{error}</p>
        ) : data ? (
          <div>
            <div className="-mx-1 overflow-x-auto">{render(data)}</div>
            {data.context ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Based on</span>
                {Object.entries(data.context).map(([k, v]) => (
                  <span key={k} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {humanize(k)}: <span className="font-medium text-zinc-800 dark:text-zinc-100">{String(v)}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-8 text-center dark:border-zinc-700 dark:bg-zinc-800/45">
            <span className="mb-2 text-2xl opacity-60">{icon}</span>
            <p className="text-sm text-zinc-500 dark:text-zinc-300">
              Hit <span className="font-medium text-zinc-700 dark:text-zinc-50">{buttonLabel}</span> for an AI suggestion from your live data.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2.5 py-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-3.5 flex-1 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-3.5 w-14 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-3.5 w-10 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

// --- Shared presentational helpers used by the insight renderers --------------

export const TH = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-400";
export const TD = "px-3 py-2.5 text-sm text-zinc-700 align-middle dark:text-zinc-300";
export const NUM = "tabular-nums";

const RISK_TONE: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-emerald-100 text-emerald-700",
};

export function RiskPill({ level }: { level: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${RISK_TONE[level] ?? RISK_TONE.low}`}>
      {level}
    </span>
  );
}

const CONF_TONE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

export function ConfidencePill({ level }: { level: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${CONF_TONE[level] ?? CONF_TONE.low}`}>
      {level}
    </span>
  );
}

// Thin progress bar: `value` filled of `max`, colored by tone.
export function MiniBar({ value, max, tone = "bg-zinc-400" }: { value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(3, (value / max) * 100)) : 0;
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
