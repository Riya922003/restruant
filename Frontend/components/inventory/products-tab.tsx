"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, Card, EmptyState, ErrorState, LoadingState, Modal } from "@/components/ui/primitives";
import { formatCurrency } from "@/lib/formatters";

type Product = {
  id: number;
  sku: string;
  name: string;
  category_id: number | null;
  unit: string;
  current_stock: number;
  reorder_level: number;
  cost_price: number;
  supplier_id: number | null;
  warehouse_id: number | null;
  is_active: boolean;
};
type Ref = { id: number; name: string };

const UNITS = ["kg", "g", "l", "ml", "unit", "pack", "dozen", "box"];
const MOVE_TYPES = ["stock_in", "stock_out", "adjustment", "wastage", "transfer"];

export function ProductsTab({ canManage }: { canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const { data, loading, error, refetch } = useApi(
    () => api.list<Product>(`/products?limit=100${search ? `&search=${encodeURIComponent(search)}` : ""}${lowOnly ? "&low_stock=true" : ""}`),
    [search, lowOnly]
  );
  const cats = useApi(() => api.list<Ref>("/product-categories?limit=100"), []);
  const whs = useApi(() => api.list<Ref>("/warehouses?limit=100"), []);
  const sups = useApi(() => api.list<Ref>("/suppliers?limit=100"), []);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ sku: "", name: "", unit: "unit", category_id: "", warehouse_id: "", supplier_id: "", reorder_level: "0", cost_price: "0", current_stock: "0" });
  const [move, setMove] = useState<Product | null>(null);
  const [moveForm, setMoveForm] = useState({ movement_type: "stock_in", quantity: "1", reason: "", direction: "increase" });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const catName = (id: number | null) => cats.data?.data.find((c) => c.id === id)?.name ?? "-";

  async function createProduct() {
    setSaving(true); setErr(null);
    try {
      await api.post("/products", {
        sku: form.sku, name: form.name, unit: form.unit,
        category_id: form.category_id ? Number(form.category_id) : null,
        warehouse_id: form.warehouse_id ? Number(form.warehouse_id) : null,
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        reorder_level: Number(form.reorder_level), cost_price: Number(form.cost_price), current_stock: Number(form.current_stock),
      });
      setShowCreate(false);
      setForm({ sku: "", name: "", unit: "unit", category_id: "", warehouse_id: "", supplier_id: "", reorder_level: "0", cost_price: "0", current_stock: "0" });
      refetch();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  async function recordMovement() {
    if (!move) return;
    setSaving(true); setErr(null);
    try {
      const body: Record<string, unknown> = {
        product_id: move.id, warehouse_id: move.warehouse_id, movement_type: moveForm.movement_type,
        quantity: Number(moveForm.quantity), reason: moveForm.reason || null,
      };
      if (moveForm.movement_type === "adjustment") body.direction = moveForm.direction;
      await api.post("/stock-movements", body);
      setMove(null);
      setMoveForm({ movement_type: "stock_in", quantity: "1", reason: "", direction: "increase" });
      refetch();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Search sku, name" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only
        </label>
        {canManage ? <Button className="ml-auto" onClick={() => { setErr(null); setShowCreate(true); }}>New product</Button> : null}
      </div>

      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refetch} /> : !data || data.data.length === 0 ? (
        <EmptyState title="No products" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">SKU</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3 text-right">Reorder</th>
                <th className="px-4 py-3 text-right">Cost</th>{canManage ? <th className="px-4 py-3 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.data.map((p) => {
                const low = p.current_stock <= p.reorder_level;
                return (
                  <tr key={p.id} className={`border-b border-zinc-100 ${low ? "bg-amber-50" : "hover:bg-zinc-50"}`}>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-700">{p.sku}</td>
                    <td className="px-4 py-3 font-medium text-zinc-900">{p.name}</td>
                    <td className="px-4 py-3 text-zinc-600">{catName(p.category_id)}</td>
                    <td className="px-4 py-3 text-right">
                      {p.current_stock} {p.unit} {low ? <Badge tone="amber">low</Badge> : null}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600">{p.reorder_level}</td>
                    <td className="px-4 py-3 text-right text-zinc-600">{formatCurrency(p.cost_price)}</td>
                    {canManage ? (
                      <td className="px-4 py-3 text-right">
                        <Button variant="secondary" size="sm" onClick={() => { setErr(null); setMove(p); }}>Stock</Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New product"
        footer={<><Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button><Button onClick={createProduct} disabled={saving || !form.sku || !form.name}>{saving ? "Saving..." : "Create"}</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU"><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Unit"><Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
          <Field label="Category"><Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}><option value="">None</option>{cats.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Warehouse"><Select value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}><option value="">None</option>{whs.data?.data.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
          <Field label="Supplier"><Select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}><option value="">None</option>{sups.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Opening stock"><Input type="number" value={form.current_stock} onChange={(e) => setForm({ ...form, current_stock: e.target.value })} /></Field>
          <Field label="Reorder level"><Input type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} /></Field>
          <Field label="Cost price"><Input type="number" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></Field>
        </div>
        {err ? <p className="mt-3 text-sm text-red-700">{err}</p> : null}
      </Modal>

      <Modal open={!!move} onClose={() => setMove(null)} title={move ? `Stock movement: ${move.name}` : ""}
        footer={<><Button variant="secondary" onClick={() => setMove(null)}>Cancel</Button><Button onClick={recordMovement} disabled={saving}>{saving ? "Saving..." : "Record"}</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Current: {move?.current_stock} {move?.unit}</p>
          <Field label="Type"><Select value={moveForm.movement_type} onChange={(e) => setMoveForm({ ...moveForm, movement_type: e.target.value })}>{MOVE_TYPES.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}</Select></Field>
          {moveForm.movement_type === "adjustment" ? (
            <Field label="Direction"><Select value={moveForm.direction} onChange={(e) => setMoveForm({ ...moveForm, direction: e.target.value })}><option value="increase">increase</option><option value="decrease">decrease</option></Select></Field>
          ) : null}
          <Field label="Quantity"><Input type="number" value={moveForm.quantity} onChange={(e) => setMoveForm({ ...moveForm, quantity: e.target.value })} /></Field>
          <Field label="Reason"><Input value={moveForm.reason} onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })} /></Field>
          {!move?.warehouse_id ? <p className="text-xs text-amber-700">This product has no home warehouse; set one before recording movements.</p> : null}
          {err ? <p className="text-sm text-red-700">{err}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
