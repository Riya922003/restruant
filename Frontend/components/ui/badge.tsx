import { humanize } from "@/lib/formatters";

type Tone = "zinc" | "green" | "amber" | "red" | "blue" | "violet" | "cyan";

const TONES: Record<Tone, string> = {
  zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  green: "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  red: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
};

export function Badge({ children, tone = "zinc" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const ORDER_STATUS: Record<string, Tone> = {
  open: "zinc",
  sent_to_kitchen: "blue",
  preparing: "amber",
  ready: "violet",
  served: "cyan",
  completed: "green",
  cancelled: "red",
};

const TABLE_STATUS: Record<string, Tone> = {
  available: "green",
  occupied: "amber",
  reserved: "blue",
  out_of_service: "red",
};

const PAYMENT_STATUS: Record<string, Tone> = {
  unpaid: "red",
  paid: "green",
  refunded: "zinc",
};

const PO_STATUS: Record<string, Tone> = {
  draft: "zinc",
  ordered: "blue",
  partially_received: "amber",
  received: "green",
  cancelled: "red",
};

const INVOICE_STATUS: Record<string, Tone> = {
  pending: "amber",
  verified: "blue",
  paid: "green",
  disputed: "red",
};

const MAPS: Record<string, Record<string, Tone>> = {
  order: ORDER_STATUS,
  table: TABLE_STATUS,
  payment: PAYMENT_STATUS,
  purchase_order: PO_STATUS,
  invoice: INVOICE_STATUS,
};

export function StatusBadge({
  value,
  kind,
}: {
  value: string;
  kind: "order" | "table" | "payment" | "purchase_order" | "invoice";
}) {
  const tone = MAPS[kind]?.[value] ?? "zinc";
  return <Badge tone={tone}>{humanize(value)}</Badge>;
}
