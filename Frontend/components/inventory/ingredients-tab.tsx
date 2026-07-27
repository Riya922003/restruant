"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, Card, EmptyState, ErrorState, LoadingState, Modal } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/formatters";

type Ingredient = {
  id: number;
  name: string;
  unit: string;
  current_stock: number;
  reorder_level: number;
  cost_per_unit: number;
  supplier_id: number | null;
  is_active: boolean;
};
type Ref = { id: number; name: string };
const UNITS = ["kg", "g", "l", "ml", "unit", "pack", "dozen", "box"];

export function IngredientsTab() {
  const toast = useToast();
  const { user } = useAuth();
  const role = user?.role ?? "";
  const canCreate = ["owner", "manager", "store_manager"].includes(role);
  const canAdjust = canCreate || role === "chef";

  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const { data, loading, error, refetch } = useApi(
    () => api.list<Ingredient>(`/ingredients?limit=100${search ? `&search=${encodeURIComponent(search)}` : ""}${lowOnly ? "&low_stock=true" : ""}`),
    [search, lowOnly]
  );
  const sups = useApi(() => api.list<Ref>("/suppliers?limit=100"), []);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "kg", current_stock: "0", reorder_level: "0", cost_per_unit: "0", supplier_id: "" });
  const [adjust, setAdjust] = useState<Ingredient | null>(null);
  const [adjustForm, setAdjustForm] = useState({ delta: "", reason: "" });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function createIngredient() {
    setSaving(true); setErr(null);
    try {
      await api.post("/ingredients", {
        name: form.name, unit: form.unit, current_stock: Number(form.current_stock),
        reorder_level: Number(form.reorder_level), cost_per_unit: Number(form.cost_per_unit),
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
      });
      setShowCreate(false);
      setForm({ name: "", unit: "kg", current_stock: "0", reorder_level: "0", cost_per_unit: "0", supplier_id: "" });
      toast.success(`Ingredient "${form.name}" created`);
      refetch();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  async function submitAdjust() {
    if (!adjust) return;
    setSaving(true); setErr(null);
    try {
      await api.post(`/ingredients/${adjust.id}/adjust-stock`, { delta: Number(adjustForm.delta), reason: adjustForm.reason });
      const adjustedName = adjust.name;
      setAdjust(null); setAdjustForm({ delta: "", reason: "" });
      toast.success(`Stock adjusted for ${adjustedName}`);
      refetch();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Search name" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only
        </label>
        {canCreate ? <Button className="ml-auto" onClick={() => { setErr(null); setShowCreate(true); }}>New ingredient</Button> : null}
      </div>

      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refetch} /> : !data || data.data.length === 0 ? (
        <EmptyState title="No ingredients" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Name</th><th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3 text-right">Reorder</th>
                <th className="px-4 py-3 text-right">Cost/unit</th>{canAdjust ? <th className="px-4 py-3 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.data.map((i) => {
                const low = i.current_stock <= i.reorder_level;
                return (
                  <tr key={i.id} className={`border-b border-zinc-100 ${low ? "bg-amber-50" : "hover:bg-zinc-50"}`}>
                    <td className="px-4 py-3 font-medium text-zinc-900">{i.name}</td>
                    <td className="px-4 py-3 text-zinc-600">{i.unit}</td>
                    <td className="px-4 py-3 text-right">{i.current_stock} {low ? <Badge tone="amber">low</Badge> : null}</td>
                    <td className="px-4 py-3 text-right text-zinc-600">{i.reorder_level}</td>
                    <td className="px-4 py-3 text-right text-zinc-600">{formatCurrency(i.cost_per_unit)}</td>
                    {canAdjust ? (
                      <td className="px-4 py-3 text-right">
                        <Button variant="secondary" size="sm" onClick={() => { setErr(null); setAdjust(i); }}>Adjust</Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New ingredient"
        footer={<><Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button><Button onClick={createIngredient} disabled={saving || !form.name}>{saving ? "Saving..." : "Create"}</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Unit"><Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
          <Field label="Current stock"><Input type="number" value={form.current_stock} onChange={(e) => setForm({ ...form, current_stock: e.target.value })} /></Field>
          <Field label="Reorder level"><Input type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} /></Field>
          <Field label="Cost per unit"><Input type="number" value={form.cost_per_unit} onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })} /></Field>
          <Field label="Supplier"><Select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}><option value="">None</option>{sups.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        </div>
        {err ? <p className="mt-3 text-sm text-red-700">{err}</p> : null}
      </Modal>

      <Modal open={!!adjust} onClose={() => setAdjust(null)} title={adjust ? `Adjust: ${adjust.name}` : ""}
        footer={<><Button variant="secondary" onClick={() => setAdjust(null)}>Cancel</Button><Button onClick={submitAdjust} disabled={saving || !adjustForm.delta || !adjustForm.reason}>{saving ? "Saving..." : "Apply"}</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Current: {adjust?.current_stock} {adjust?.unit}. Use a negative delta to consume.</p>
          <Field label="Delta (+/-)"><Input type="number" value={adjustForm.delta} onChange={(e) => setAdjustForm({ ...adjustForm, delta: e.target.value })} /></Field>
          <Field label="Reason"><Input value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} /></Field>
          {err ? <p className="text-sm text-red-700">{err}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
