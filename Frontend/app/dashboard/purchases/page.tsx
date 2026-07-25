"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { StatusBadge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, Card, EmptyState, ErrorState, LoadingState, Modal, PageHeader } from "@/components/ui/primitives";
import { formatCurrency, formatDate } from "@/lib/formatters";

type POItem = { id: number; product_id: number; quantity_ordered: number; quantity_received: number; unit_cost: number; line_total: number };
type PO = {
  id: number; po_number: string; supplier_id: number; warehouse_id: number; status: string;
  order_date: string | null; expected_date: string | null; received_date: string | null;
  subtotal: number; tax: number; total: number; items?: POItem[];
};
type Ref = { id: number; name: string };
type Product = { id: number; name: string; sku: string; cost_price: number };

const STATUSES = ["draft", "ordered", "partially_received", "received", "cancelled"];

export default function PurchasesPage() {
  const { user } = useAuth();
  const canManage = ["owner", "manager", "store_manager"].includes(user?.role ?? "");

  const [status, setStatus] = useState("");
  const { data, loading, error, refetch } = useApi(
    () => api.list<PO>(`/purchase-orders?limit=100${status ? `&status=${status}` : ""}`),
    [status]
  );
  const suppliers = useApi(() => api.list<Ref>("/suppliers?limit=100"), []);
  const warehouses = useApi(() => api.list<Ref>("/warehouses?limit=100"), []);
  const products = useApi(() => api.list<Product>("/products?limit=200"), []);

  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<PO | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // create form
  const [head, setHead] = useState({ supplier_id: "", warehouse_id: "", expected_date: "" });
  const [lines, setLines] = useState<{ product_id: string; quantity_ordered: string; unit_cost: string }[]>([]);
  const [pick, setPick] = useState({ product_id: "", quantity_ordered: "1", unit_cost: "" });

  function addLine() {
    if (!pick.product_id) return;
    setLines([...lines, { ...pick }]);
    setPick({ product_id: "", quantity_ordered: "1", unit_cost: "" });
  }
  const prodName = (id: number) => products.data?.data.find((p) => p.id === id)?.name ?? `#${id}`;
  const createSubtotal = lines.reduce((s, l) => s + Number(l.quantity_ordered) * Number(l.unit_cost || 0), 0);

  async function createPO() {
    setBusy(true); setErr(null);
    try {
      await api.post("/purchase-orders", {
        supplier_id: Number(head.supplier_id),
        warehouse_id: Number(head.warehouse_id),
        expected_date: head.expected_date || null,
        items: lines.map((l) => ({ product_id: Number(l.product_id), quantity_ordered: Number(l.quantity_ordered), unit_cost: Number(l.unit_cost) })),
      });
      setShowCreate(false); setHead({ supplier_id: "", warehouse_id: "", expected_date: "" }); setLines([]);
      refetch();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  async function openDetail(id: number) {
    setErr(null);
    const po = await api.get<PO>(`/purchase-orders/${id}`);
    setDetail(po);
  }
  async function refreshDetail() {
    if (detail) setDetail(await api.get<PO>(`/purchase-orders/${detail.id}`));
    refetch();
  }

  async function action(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); await refreshDetail(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }

  // receive form: item_id -> qty
  const [recv, setRecv] = useState<Record<number, string>>({});
  async function submitReceive() {
    if (!detail) return;
    const linesToRecv = Object.entries(recv)
      .filter(([, q]) => Number(q) > 0)
      .map(([item_id, q]) => ({ item_id: Number(item_id), quantity: Number(q) }));
    if (linesToRecv.length === 0) { setErr("Enter a quantity to receive"); return; }
    await action(() => api.post(`/purchase-orders/${detail.id}/receive`, { lines: linesToRecv }));
    setRecv({});
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Purchase Orders"
        subtitle="Replenishment orders and receiving"
        actions={canManage ? <Button onClick={() => { setErr(null); setShowCreate(true); }}>New PO</Button> : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-52">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </Select>
      </div>

      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refetch} /> : !data || data.data.length === 0 ? (
        <EmptyState title="No purchase orders" description="Create a PO to replenish stock." action={canManage ? <Button onClick={() => setShowCreate(true)}>New PO</Button> : undefined} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3">PO #</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Expected</th><th className="px-4 py-3 text-right">Total</th>
            </tr></thead>
            <tbody>
              {data.data.map((po) => (
                <tr key={po.id} className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50" onClick={() => openDetail(po.id)}>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-800">{po.po_number}</td>
                  <td className="px-4 py-3 text-zinc-700">{suppliers.data?.data.find((s) => s.id === po.supplier_id)?.name ?? `#${po.supplier_id}`}</td>
                  <td className="px-4 py-3"><StatusBadge value={po.status} kind="purchase_order" /></td>
                  <td className="px-4 py-3 text-zinc-600">{formatDate(po.expected_date)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(po.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New purchase order"
        footer={<><Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button onClick={createPO} disabled={busy || !head.supplier_id || !head.warehouse_id || lines.length === 0}>{busy ? "Saving..." : "Create draft"}</Button></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier"><Select value={head.supplier_id} onChange={(e) => setHead({ ...head, supplier_id: e.target.value })}><option value="">Select</option>{suppliers.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Warehouse"><Select value={head.warehouse_id} onChange={(e) => setHead({ ...head, warehouse_id: e.target.value })}><option value="">Select</option>{warehouses.data?.data.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
          </div>
          <Field label="Expected date"><Input type="date" value={head.expected_date} onChange={(e) => setHead({ ...head, expected_date: e.target.value })} /></Field>

          <div className="rounded-lg border border-zinc-200 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Line items</p>
            {lines.length === 0 ? <p className="text-sm text-zinc-500">No items yet.</p> : (
              <ul className="mb-2 space-y-1 text-sm">
                {lines.map((l, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span>{prodName(Number(l.product_id))} × {l.quantity_ordered} @ {formatCurrency(Number(l.unit_cost || 0))}</span>
                    <button className="text-red-600 hover:underline" onClick={() => setLines(lines.filter((_, j) => j !== i))}>remove</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2">
              <Select value={pick.product_id} onChange={(e) => { const p = products.data?.data.find((x) => x.id === Number(e.target.value)); setPick({ ...pick, product_id: e.target.value, unit_cost: p ? String(p.cost_price) : pick.unit_cost }); }}>
                <option value="">Product</option>{products.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Input className="w-20" type="number" value={pick.quantity_ordered} onChange={(e) => setPick({ ...pick, quantity_ordered: e.target.value })} placeholder="Qty" />
              <Input className="w-24" type="number" value={pick.unit_cost} onChange={(e) => setPick({ ...pick, unit_cost: e.target.value })} placeholder="Cost" />
              <Button variant="secondary" size="sm" onClick={addLine}>Add</Button>
            </div>
            <p className="mt-2 text-right text-sm text-zinc-600">Subtotal: {formatCurrency(createSubtotal)}</p>
          </div>
          {err ? <p className="text-sm text-red-700">{err}</p> : null}
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => { setDetail(null); setRecv({}); }} title={detail ? detail.po_number : ""}
        footer={detail ? (
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              {canManage && (detail.status === "ordered" || detail.status === "partially_received") ? (
                <Button onClick={submitReceive} disabled={busy}>Receive entered</Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              {canManage && detail.status === "draft" ? (
                <Button variant="secondary" disabled={busy} onClick={() => action(() => api.patch(`/purchase-orders/${detail.id}`, { status: "ordered" }))}>Place order</Button>
              ) : null}
              {canManage && detail.status !== "received" && detail.status !== "cancelled" ? (
                <Button variant="danger" disabled={busy} onClick={() => { if (confirm("Cancel / delete this PO?")) action(() => api.del(`/purchase-orders/${detail.id}`)).then(() => { refetch(); setDetail(null); }); }}>
                  {detail.status === "draft" ? "Delete" : "Cancel"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}>
        {detail ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2"><StatusBadge value={detail.status} kind="purchase_order" /><span className="text-sm text-zinc-500">Expected {formatDate(detail.expected_date)}</span></div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
                <th className="py-2">Product</th><th className="py-2 text-right">Ordered</th><th className="py-2 text-right">Received</th><th className="py-2 text-right">Cost</th>
                {detail.status === "ordered" || detail.status === "partially_received" ? <th className="py-2 text-right">Receive now</th> : null}
              </tr></thead>
              <tbody>
                {detail.items?.map((it) => (
                  <tr key={it.id} className="border-b border-zinc-100">
                    <td className="py-2">{prodName(it.product_id)}</td>
                    <td className="py-2 text-right">{it.quantity_ordered}</td>
                    <td className="py-2 text-right">{it.quantity_received}</td>
                    <td className="py-2 text-right">{formatCurrency(it.unit_cost)}</td>
                    {detail.status === "ordered" || detail.status === "partially_received" ? (
                      <td className="py-2 text-right">
                        <Input className="w-20" type="number" min={0} value={recv[it.id] ?? ""} onChange={(e) => setRecv({ ...recv, [it.id]: e.target.value })} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right text-sm text-zinc-700">
              <p>Subtotal {formatCurrency(detail.subtotal)} · Tax {formatCurrency(detail.tax)}</p>
              <p className="text-base font-semibold text-zinc-950">Total {formatCurrency(detail.total)}</p>
            </div>
            {err ? <p className="text-sm text-red-700">{err}</p> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
