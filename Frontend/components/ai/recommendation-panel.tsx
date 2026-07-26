"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { Button, Card } from "@/components/ui/primitives";
import { humanize } from "@/lib/formatters";
import type { AiContext } from "@/types/ai";

// Reusable "generate a suggestion" panel: a titled card with a Generate button,
// loading/error/empty states, a slot to render the result, and an inputs-echo
// footer so users can see the data the suggestion was grounded in (spec 02 s2).
export function RecommendationPanel<T extends { context?: AiContext }>({
  title,
  description,
  icon,
  buttonLabel = "Generate",
  run,
  render,
}: {
  title: string;
  description: string;
  icon: string;
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
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-lg">
            {icon}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
          </div>
        </div>
        <Button size="sm" onClick={go} disabled={loading}>
          {loading ? "Thinking..." : data ? "Refresh" : buttonLabel}
        </Button>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-zinc-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
            Analyzing your data...
          </div>
        ) : error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : data ? (
          <div>
            {render(data)}
            {data.context ? (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3">
                <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                  Based on
                </span>
                {Object.entries(data.context).map(([k, v]) => (
                  <span
                    key={k}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600"
                  >
                    {humanize(k)}: {String(v)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="py-6 text-sm text-zinc-400">
            Click {buttonLabel} to get an AI suggestion from your live data.
          </p>
        )}
      </div>
    </Card>
  );
}

const RISK_TONE: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-zinc-100 text-zinc-600",
};

export function RiskPill({ level }: { level: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${RISK_TONE[level] ?? RISK_TONE.low}`}>
      {level}
    </span>
  );
}
