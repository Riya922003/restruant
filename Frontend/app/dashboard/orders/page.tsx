"use client";

import { useState } from "react";
import { api, downloadFile } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { StatusBadge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { formatCurrency, formatDateTime, humanize } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
} from "@/components/ui/primitives";

type Order = {
  id: number;
  order_number: string;
  table_id: number | null;
  order_type: string;
  status: string;
  waiter_id: number | null;
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
  capacity: number;
  section: string | null;
  status: string;
};

type MenuItem = {
  id: number;
  name: string;
  price: number;
  is_available: boolean;
};

const ORDER_STATUSES = ["open", "sent_to_kitchen", "preparing", "ready", "served", "completed", "cancelled"];
const ACTIVE_PRESET = "open,sent_to_kitchen,preparing,ready,served";
const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"];
const PAYMENT_METHODS = ["cash", "card", "upi", "bank_transfer", "other"];
const ORDER_TYPES = ["dine_in", "takeaway", "delivery"];

const NEXT_STATUS: Record<string, string> = {
  open: "sent_to_kitchen",
  sent_to_kitchen: "preparing",
  preparing: "ready",
  ready: "served",
  served: "completed",
};

export default function OrdersPage() {
  const toast = useToast();
  const { user } = useAuth();
  const canCreate = user?.role === "owner" || user?.role === "manager" || user?.role === "waiter";
  const canPay = user?.role === "owner" || user?.role === "manager" || user?.role === "cashier";
  const canCancel = user?.role === "owner" || user?.role === "manager";

  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [search, setSearch] = useState("");
  const { data, loading, error, refetch } = useApi(
    () =>
      api.list<Order>(
        `/orders?limit=100${statusFilter ? `&status=${statusFilter}` : ""}${
          paymentFilter ? `&payment_status=${paymentFilter}` : ""
        }${search ? `&search=${encodeURIComponent(search)}` : ""}`
      ),
    [statusFilter, paymentFilter, search]
  );

  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  async function exportCsv() {
    const q = new URLSearchParams();
    if (statusFilter) q.set("status", statusFilter);
    if (paymentFilter) q.set("payment_status", paymentFilter);
    if (search) q.set("search", search);
    const qs = q.toString();
    try {
      await downloadFile(`/orders/export${qs ? `?${qs}` : ""}`, "orders.csv");
      toast.success("Orders exported");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Orders"
        subtitle="Live order queue and checkout"
        actions={canCreate ? <Button onClick={() => setShowCreate(true)}>New order</Button> : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-48">
          <option value="">All statuses</option>
          <option value={ACTIVE_PRESET}>Active</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="max-w-48">
          <option value="">All payments</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Input className="max-w-64" placeholder="Search order #" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button variant="secondary" className="ml-auto" onClick={exportCsv}>Export CSV</Button>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="No orders"
          description="Orders placed will appear here in the live queue."
          action={canCreate ? <Button onClick={() => setShowCreate(true)}>New order</Button> : undefined}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                <th className="px-4 py-2 text-left font-medium">Order #</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-left font-medium">Table</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-left font-medium">Payment</th>
                <th className="px-4 py-2 text-left font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => setDetailId(order.id)}
                  className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50"
                >
                  <td className="px-4 py-2 font-medium text-zinc-950">{order.order_number}</td>
                  <td className="px-4 py-2 text-zinc-700">{humanize(order.order_type)}</td>
                  <td className="px-4 py-2 text-zinc-700">{order.table_id ?? "-"}</td>
                  <td className="px-4 py-2">
                    <StatusBadge value={order.status} kind="order" />
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-950">{formatCurrency(order.total)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge value={order.payment_status} kind="payment" />
                  </td>
                  <td className="px-4 py-2 text-zinc-500">{formatDateTime(order.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {detailId !== null ? (
        <OrderDetailModal
          orderId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={refetch}
          canPay={canPay}
          canCancel={canCancel}
        />
      ) : null}

      {showCreate ? (
        <CreateOrderModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function OrderDetailModal({
  orderId,
  onClose,
  onChanged,
  canPay,
  canCancel,
}: {
  orderId: number;
  onClose: () => void;
  onChanged: () => void;
  canPay: boolean;
  canCancel: boolean;
}) {
  const toast = useToast();
  const { data: order, loading, error, refetch } = useApi(
    () => api.get<OrderDetail>(`/orders/${orderId}`),
    [orderId]
  );

  const [busy, setBusy] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [payMethod, setPayMethod] = useState("cash");
  const [payComplete, setPayComplete] = useState(false);

  async function advanceStatus(next: string) {
    setBusy(true);
    try {
      await api.patch(`/orders/${orderId}/status`, { status: next });
      toast.success(`Order ${humanize(next)}`);
      refetch();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
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
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to take payment");
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder() {
    if (!confirm("Cancel this order?")) return;
    setBusy(true);
    try {
      await api.del(`/orders/${orderId}`);
      toast.success("Order cancelled");
      refetch();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel order");
    } finally {
      setBusy(false);
    }
  }

  const next = order ? NEXT_STATUS[order.status] : undefined;
  const showPayButton = canPay && order?.payment_status === "unpaid" && order?.status !== "cancelled";
  const showCancelButton =
    canCancel && order && order.status !== "completed" && order.status !== "cancelled";

  return (
    <Modal open onClose={onClose} title={order ? `Order ${order.order_number}` : "Order"}>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !order ? (
        <EmptyState title="Order not found" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={order.status} kind="order" />
            <StatusBadge value={order.payment_status} kind="payment" />
            <span className="text-xs text-zinc-500">
              {humanize(order.order_type)}
              {order.table_id ? ` · Table ${order.table_id}` : ""}
            </span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                <th className="px-2 py-2 text-left font-medium">Item</th>
                <th className="px-2 py-2 text-right font-medium">Qty</th>
                <th className="px-2 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-zinc-100">
                  <td className="px-2 py-2 text-zinc-800">{item.item_name}</td>
                  <td className="px-2 py-2 text-right text-zinc-700">{item.quantity}</td>
                  <td className="px-2 py-2 text-right text-zinc-950">{formatCurrency(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1 border-t border-zinc-200 pt-3 text-sm">
            <div className="flex justify-between text-zinc-600">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Tax</span>
              <span>{formatCurrency(order.tax)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Discount</span>
              <span>{formatCurrency(order.discount)}</span>
            </div>
            <div className="flex justify-between font-semibold text-zinc-950">
              <span>Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>

          {showPay ? (
            <div className="space-y-3 rounded-lg border border-zinc-200 p-3">
              <Field label="Payment method">
                <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {humanize(m)}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={payComplete}
                  onChange={(e) => setPayComplete(e.target.checked)}
                />
                Complete order
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowPay(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={takePayment} disabled={busy}>
                  {busy ? "Saving..." : "Confirm payment"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-3">
            {showCancelButton ? (
              <Button variant="danger" size="sm" onClick={cancelOrder} disabled={busy}>
                Cancel order
              </Button>
            ) : null}
            {showPayButton && !showPay ? (
              <Button variant="secondary" size="sm" onClick={() => setShowPay(true)} disabled={busy}>
                Take payment
              </Button>
            ) : null}
            {next ? (
              <Button size="sm" onClick={() => advanceStatus(next)} disabled={busy}>
                {`Advance to ${humanize(next)}`}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}

type Line = { menu_item_id: number; name: string; price: number; quantity: number };

function CreateOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [orderType, setOrderType] = useState("dine_in");
  const [tableId, setTableId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [selectedItem, setSelectedItem] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const tables = useApi(() => api.list<Table>("/tables?limit=100"), []);
  const menuItems = useApi(() => api.list<MenuItem>("/menu-items?limit=100&is_available=true"), []);

  function addLine() {
    const id = Number(selectedItem);
    const item = menuItems.data?.data.find((m) => m.id === id);
    const qty = Number(quantity);
    if (!item || qty < 1) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.menu_item_id === id);
      if (existing) {
        return prev.map((l) => (l.menu_item_id === id ? { ...l, quantity: l.quantity + qty } : l));
      }
      return [...prev, { menu_item_id: id, name: item.name, price: item.price, quantity: qty }];
    });
    setSelectedItem("");
    setQuantity("1");
  }

  function removeLine(id: number) {
    setLines((prev) => prev.filter((l) => l.menu_item_id !== id));
  }

  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  async function submit() {
    setFormError(null);
    if (orderType === "dine_in" && !tableId) {
      setFormError("Dine-in orders require a table.");
      return;
    }
    if (lines.length === 0) {
      setFormError("Add at least one item.");
      return;
    }
    setSaving(true);
    try {
      const body: {
        order_type: string;
        table_id?: number;
        items: { menu_item_id: number; quantity: number }[];
      } = {
        order_type: orderType,
        items: lines.map((l) => ({ menu_item_id: l.menu_item_id, quantity: l.quantity })),
      };
      if (orderType === "dine_in") body.table_id = Number(tableId);
      await api.post("/orders", body);
      toast.success("Order created");
      onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New order"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving..." : "Create order"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Order type">
          <Select
            value={orderType}
            onChange={(e) => {
              setOrderType(e.target.value);
              if (e.target.value !== "dine_in") setTableId("");
            }}
          >
            {ORDER_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </Select>
        </Field>

        {orderType === "dine_in" ? (
          <Field label="Table">
            <Select value={tableId} onChange={(e) => setTableId(e.target.value)}>
              <option value="">Select a table</option>
              {tables.data?.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({humanize(t.status)})
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div className="space-y-2 rounded-lg border border-zinc-200 p-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="Menu item">
                <Select value={selectedItem} onChange={(e) => setSelectedItem(e.target.value)}>
                  <option value="">Select an item</option>
                  {menuItems.data?.data.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {formatCurrency(m.price)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-20">
              <Field label="Qty">
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </Field>
            </div>
            <Button variant="secondary" onClick={addLine} disabled={!selectedItem}>
              Add
            </Button>
          </div>

          {lines.length > 0 ? (
            <table className="w-full text-sm">
              <tbody>
                {lines.map((l) => (
                  <tr key={l.menu_item_id} className="border-b border-zinc-100">
                    <td className="py-1.5 text-zinc-800">{l.name}</td>
                    <td className="py-1.5 text-right text-zinc-600">× {l.quantity}</td>
                    <td className="py-1.5 text-right text-zinc-950">
                      {formatCurrency(l.price * l.quantity)}
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      <button
                        onClick={() => removeLine(l.menu_item_id)}
                        className="text-xs text-red-700 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-zinc-500">No items added yet.</p>
          )}

          {lines.length > 0 ? (
            <div className="flex justify-between border-t border-zinc-200 pt-2 text-sm font-medium text-zinc-950">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
          ) : null}
        </div>

        {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
      </div>
    </Modal>
  );
}
