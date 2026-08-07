"use client";

import { Field, Select } from "@/components/ui/field";
import { Button, Card } from "@/components/ui/primitives";
import { formatCurrency, humanize } from "@/lib/formatters";

const PAYMENT_METHODS = ["cash", "card", "upi", "bank_transfer", "other"];

export function OrderTotalsCard({ subtotal, tax, discount, total }: { subtotal: number; tax: number; discount: number; total: number }) {
  return (
    <Card className="p-4">
      <div className="ml-auto max-w-sm space-y-2 text-sm">
        <div className="flex justify-between text-zinc-600"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
        <div className="flex justify-between text-zinc-600"><span>Tax</span><span>{formatCurrency(tax)}</span></div>
        <div className="flex justify-between text-zinc-600"><span>Discount</span><span>{formatCurrency(discount)}</span></div>
        <div className="flex justify-between border-t border-zinc-200 pt-2 font-semibold text-zinc-950"><span>Total</span><span>{formatCurrency(total)}</span></div>
      </div>
    </Card>
  );
}

export function OrderPaymentPanel({
  busy,
  payMethod,
  payComplete,
  onPayMethodChange,
  onPayCompleteChange,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  payMethod: string;
  payComplete: boolean;
  onPayMethodChange: (value: string) => void;
  onPayCompleteChange: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Card className="space-y-3 p-4">
      <Field label="Payment method">
        <Select value={payMethod} onChange={(e) => onPayMethodChange(e.target.value)}>
          {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{humanize(method)}</option>)}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <input type="checkbox" checked={payComplete} onChange={(e) => onPayCompleteChange(e.target.checked)} />
        Complete order
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={onConfirm} disabled={busy}>{busy ? "Saving..." : "Confirm payment"}</Button>
      </div>
    </Card>
  );
}