import { humanize } from "@/lib/formatters";

type Tone = "zinc" | "green" | "amber" | "red" | "blue" | "violet" | "cyan";

const TONES: Record<Tone, string> = {
  zinc: "bg-zinc-100 text-zinc-700",
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  blue: "bg-blue-100 text-blue-700",
  violet: "bg-violet-100 text-violet-700",
  cyan: "bg-cyan-100 text-cyan-700",
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
