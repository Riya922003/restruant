"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useOrderEvents } from "@/lib/use-order-events";
import { useAuth } from "@/lib/auth-context";
import { StatusBadge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { formatCurrency, formatDateTime, humanize } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/primitives";
import { OrderPaymentPanel, OrderTotalsCard } from "@/components/orders/order-detail-sections";
import { ItemDraft, OrderItemsEditor } from "@/components/orders/order-items-editor";

type Order = {
  id: number;
  order_number: string;
  table_id: number | null;
  order_type: string;
  status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payment_status: string;
  payment_method: string | null;
  notes: string | null;
  placed_at: string | null;
  completed_at: string | null;
  created_at: string;
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

type OrderDetail = Order & { items: OrderItem[] };

type Table = {
  id: number;
  label: string;
  status: string;
};

type MenuItem = {
  id: number;
  name: string;
  price: number;
  is_available: boolean;
};

type HeaderForm = {
  order_type: string;
  table_id: string;
  discount: string;
  notes: string;
};


const ORDER_TYPES = ["dine_in", "takeaway", "delivery"];
const EDITABLE_STATUSES = ["open", "sent_to_kitchen", "preparing", "ready"];

const NEXT_STATUS: Record<string, string> = {
  open: "sent_to_kitchen",
  sent_to_kitchen: "preparing",
  preparing: "ready",
  ready: "served",
  served: "completed",
};

function canWriteOrders(role?: string) {
  return role === "owner" || role === "manager" || role === "waiter";
}

function toHeaderForm(order: OrderDetail): HeaderForm {
  return {
    order_type: order.order_type,
    table_id: order.table_id ? String(order.table_id) : "",
    discount: String(order.discount ?? 0),
    notes: order.notes ?? "",
  };
}

export function OrderDetailClient({ orderId }: { orderId: number }) {
  const router = useRouter();
  const toast = useToast();
  const dialog = useAppDialog();
  const { user } = useAuth();
  const canPay = user?.role === "owner" || user?.role === "manager" || user?.role === "cashier";
  const canCancel = user?.role === "owner" || user?.role === "manager";

  const { data: order, loading, error, refetch, refresh } = useApi(
    () => api.get<OrderDetail>(`/orders/${orderId}`),
    [orderId]
  );
  const tables = useApi(() => api.list<Table>("/tables?limit=100"), []);
  const menuItems = useApi(() => api.list<MenuItem>("/menu-items?limit=100&is_available=true"), []);

  useOrderEvents(() => refresh(), { poll: refresh, pollMs: 5000 });

  const [busy, setBusy] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [payMethod, setPayMethod] = useState("cash");
  const [payComplete, setPayComplete] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerForm, setHeaderForm] = useState<HeaderForm>({ order_type: "dine_in", table_id: "", discount: "0", notes: "" });
  const [itemDrafts, setItemDrafts] = useState<Record<number, ItemDraft>>({});
  const [newItemId, setNewItemId] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");

  useEffect(() => {
    if (!order) return;
    setHeaderForm(toHeaderForm(order));
    setItemDrafts(
      Object.fromEntries(order.items.map((item) => [item.id, { quantity: String(item.quantity), notes: item.notes ?? "" }]))
    );
  }, [order]);

  async function advanceStatus(next: string) {
    setBusy(true);
    try {
      await api.patch(`/orders/${orderId}/status`, { status: next });
      toast.success(`Order ${humanize(next)}`);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setBusy(false);
    }
  }

  async function saveHeader() {
    setBusy(true);
    try {
      await api.patch(`/orders/${orderId}`, {
        order_type: headerForm.order_type,
        table_id: headerForm.order_type === "dine_in" ? Number(headerForm.table_id) : null,
        discount: Number(headerForm.discount || 0),
        notes: headerForm.notes.trim() || null,
      });
      setEditingHeader(false);
      toast.success("Order updated");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update order");
    } finally {
      setBusy(false);
    }
  }

  async function addItem() {
    if (!newItemId) return;
    setBusy(true);
    try {
      await api.post(`/orders/${orderId}/items`, {
        menu_item_id: Number(newItemId),
        quantity: Number(newItemQty || 1),
      });
      setNewItemId("");
      setNewItemQty("1");
      toast.success("Item added");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setBusy(false);
    }
  }

  async function updateItem(item: OrderItem) {
    const draft = itemDrafts[item.id];
    if (!draft) return;
    setBusy(true);
    try {
      await api.patch(`/orders/${orderId}/items/${item.id}`, {
        quantity: Number(draft.quantity || 1),
        notes: draft.notes.trim() || null,
      });
      toast.success("Item updated");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update item");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: OrderItem) {
    const confirmed = await dialog.confirm({
      title: "Remove item",
      message: `Remove ${item.item_name} from this order?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await api.del(`/orders/${orderId}/items/${item.id}`);
      toast.success("Item removed");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove item");
    } finally {
      setBusy(false);
    }
  }

  async function takePayment() {
    setBusy(true);
    try {
      await api.post(`/orders/${orderId}/payment`, {
        payment_method: payMethod,
        complete: payComplete,
      });
      setShowPay(false);
      toast.success("Payment recorded");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to take payment");
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder() {
    const confirmed = await dialog.confirm({
      title: "Cancel order",
      message: "Cancel this order?",
      confirmLabel: "Cancel order",
      destructive: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await api.del(`/orders/${orderId}`);
      toast.success("Order cancelled");
      router.push("/dashboard/orders");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel order");
    } finally {
      setBusy(false);
    }
  }

  const next = order ? NEXT_STATUS[order.status] : undefined;
  const editable = Boolean(order && canWriteOrders(user?.role) && EDITABLE_STATUSES.includes(order.status));
  const showPayButton = canPay && order?.payment_status === "unpaid" && order?.status !== "cancelled";
  const showCancelButton = canCancel && order && order.status !== "completed" && order.status !== "cancelled";

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={order ? `Order ${order.order_number}` : "Order"}
        subtitle={order ? `${humanize(order.order_type)} placed ${formatDateTime(order.created_at)}` : "Order details"}
        actions={
          <Link href="/dashboard/orders">
            <Button variant="secondary">Back to orders</Button>
          </Link>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !order ? (
        <EmptyState title="Order not found" />
      ) : (
        <div className="space-y-4">
          <Card className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={order.status} kind="order" />
              <StatusBadge value={order.payment_status} kind="payment" />
              <span className="text-sm text-zinc-500">
                {humanize(order.order_type)}
                {order.table_id ? ` - Table ${order.table_id}` : ""}
              </span>
              {editable && !editingHeader ? (
                <Button className="ml-auto" variant="secondary" size="sm" onClick={() => setEditingHeader(true)}>
                  Edit order
                </Button>
              ) : null}
            </div>

            {editingHeader ? (
              <div className="grid gap-3 border-t border-zinc-200 pt-4 sm:grid-cols-2">
                <Field label="Order type">
                  <Select
                    value={headerForm.order_type}
                    onChange={(e) =>
                      setHeaderForm((prev) => ({ ...prev, order_type: e.target.value, table_id: e.target.value === "dine_in" ? prev.table_id : "" }))
                    }
                  >
                    {ORDER_TYPES.map((type) => (
                      <option key={type} value={type}>{humanize(type)}</option>
                    ))}
                  </Select>
                </Field>
                {headerForm.order_type === "dine_in" ? (
                  <Field label="Table">
                    <Select value={headerForm.table_id} onChange={(e) => setHeaderForm((prev) => ({ ...prev, table_id: e.target.value }))}>
                      <option value="">Select a table</option>
                      {tables.data?.data.map((table) => (
                        <option key={table.id} value={table.id}>{table.label} ({humanize(table.status)})</option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
                <Field label="Discount">
                  <Input type="number" min={0} value={headerForm.discount} onChange={(e) => setHeaderForm((prev) => ({ ...prev, discount: e.target.value }))} />
                </Field>
                <Field label="Notes">
                  <Input value={headerForm.notes} onChange={(e) => setHeaderForm((prev) => ({ ...prev, notes: e.target.value }))} />
                </Field>
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <Button variant="secondary" size="sm" onClick={() => { setEditingHeader(false); setHeaderForm(toHeaderForm(order)); }} disabled={busy}>Cancel</Button>
                  <Button size="sm" onClick={saveHeader} disabled={busy || (headerForm.order_type === "dine_in" && !headerForm.table_id)}>
                    {busy ? "Saving..." : "Save order"}
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>

          <OrderItemsEditor
            items={order.items}
            editable={editable}
            busy={busy}
            itemDrafts={itemDrafts}
            menuItems={menuItems.data?.data ?? []}
            newItemId={newItemId}
            newItemQty={newItemQty}
            onDraftChange={(itemId, draft) => setItemDrafts((prev) => ({ ...prev, [itemId]: draft }))}
            onUpdateItem={updateItem}
            onRemoveItem={removeItem}
            onNewItemChange={setNewItemId}
            onNewItemQtyChange={setNewItemQty}
            onAddItem={addItem}
          />

          <OrderTotalsCard subtotal={order.subtotal} tax={order.tax} discount={order.discount} total={order.total} />

          {showPay ? (
            <OrderPaymentPanel
              busy={busy}
              payMethod={payMethod}
              payComplete={payComplete}
              onPayMethodChange={setPayMethod}
              onPayCompleteChange={setPayComplete}
              onCancel={() => setShowPay(false)}
              onConfirm={takePayment}
            />
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            {showCancelButton ? <Button variant="danger" size="sm" onClick={cancelOrder} disabled={busy}>Cancel order</Button> : null}
            {showPayButton && !showPay ? <Button variant="secondary" size="sm" onClick={() => setShowPay(true)} disabled={busy}>Take payment</Button> : null}
            {next ? <Button size="sm" onClick={() => advanceStatus(next)} disabled={busy}>{`Advance to ${humanize(next)}`}</Button> : null}
          </div>
        </div>
      )}
    </div>
  );
}