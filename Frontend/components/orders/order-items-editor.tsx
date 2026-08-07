"use client";

import { Field, Input, Select } from "@/components/ui/field";
import { formatCurrency } from "@/lib/formatters";
import { Button, Card } from "@/components/ui/primitives";

export type ItemDraft = {
  quantity: string;
  notes: string;
};

type OrderItem = {
  id: number;
  menu_item_id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  notes: string | null;
};

type MenuItem = {
  id: number;
  name: string;
  price: number;
};

export function OrderItemsEditor({
  items,
  editable,
  busy,
  itemDrafts,
  menuItems,
  newItemId,
  newItemQty,
  onDraftChange,
  onUpdateItem,
  onRemoveItem,
  onNewItemChange,
  onNewItemQtyChange,
  onAddItem,
}: {
  items: OrderItem[];
  editable: boolean;
  busy: boolean;
  itemDrafts: Record<number, ItemDraft>;
  menuItems: MenuItem[];
  newItemId: string;
  newItemQty: string;
  onDraftChange: (itemId: number, draft: ItemDraft) => void;
  onUpdateItem: (item: OrderItem) => void;
  onRemoveItem: (item: OrderItem) => void;
  onNewItemChange: (value: string) => void;
  onNewItemQtyChange: (value: string) => void;
  onAddItem: () => void;
}) {
  return (
    <>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
              <th className="px-4 py-3 text-left font-medium">Item</th>
              <th className="px-4 py-3 text-right font-medium">Qty</th>
              <th className="px-4 py-3 text-right font-medium">Unit</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              {editable ? <th className="px-4 py-3 text-right font-medium">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const draft = itemDrafts[item.id] ?? { quantity: String(item.quantity), notes: item.notes ?? "" };
              const changed = Number(draft.quantity) !== item.quantity || draft.notes !== (item.notes ?? "");
              return (
                <tr key={item.id} className="border-b border-zinc-100 last:border-0 align-top">
                  <td className="px-4 py-3 text-zinc-800">
                    <div className="font-medium">{item.item_name}</div>
                    {editable ? (
                      <Input className="mt-2" placeholder="Notes" value={draft.notes} onChange={(e) => onDraftChange(item.id, { ...draft, notes: e.target.value })} />
                    ) : item.notes ? (
                      <div className="mt-1 text-xs text-zinc-500">{item.notes}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700">
                    {editable ? (
                      <Input className="ml-auto w-20 text-right" type="number" min={1} value={draft.quantity} onChange={(e) => onDraftChange(item.id, { ...draft, quantity: e.target.value })} />
                    ) : item.quantity}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700">{formatCurrency(item.unit_price)}</td>
                  <td className="px-4 py-3 text-right text-zinc-950">{formatCurrency(item.line_total)}</td>
                  {editable ? (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => onUpdateItem(item)} disabled={busy || !changed}>Save</Button>
                        <Button variant="danger" size="sm" onClick={() => onRemoveItem(item)} disabled={busy}>Remove</Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {editable ? (
        <Card className="grid gap-3 p-4 sm:grid-cols-[1fr_96px_auto] sm:items-end">
          <Field label="Add menu item">
            <Select value={newItemId} onChange={(e) => onNewItemChange(e.target.value)}>
              <option value="">Select an item</option>
              {menuItems.map((item) => (
                <option key={item.id} value={item.id}>{item.name} - {formatCurrency(item.price)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Qty">
            <Input type="number" min={1} value={newItemQty} onChange={(e) => onNewItemQtyChange(e.target.value)} />
          </Field>
          <Button variant="secondary" onClick={onAddItem} disabled={busy || !newItemId}>Add item</Button>
        </Card>
      ) : null}
    </>
  );
}