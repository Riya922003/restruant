"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Button, Card, EmptyState, ErrorState, LoadingState, Modal } from "@/components/ui/primitives";
import { formatDateTime, humanize } from "@/lib/formatters";

type Warehouse = { id: number; name: string; location: string | null; type: string; is_active: boolean };
type Category = { id: number; name: string; description: string | null; is_active: boolean };

export function WarehousesTab({ canManage }: { canManage: boolean }) {
  const [search, setSearch] = useState("");
  const { data, loading, error, refetch } = useApi(
    () => api.list<Warehouse>(`/warehouses?limit=100&is_active=all${search ? `&search=${encodeURIComponent(search)}` : ""}`),
    [search]
  );
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", type: "store" });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true); setErr(null);
    try {
      await api.post("/warehouses", { name: form.name, location: form.location || null, type: form.type || "store" });
      setOpen(false); setForm({ name: "", location: "", type: "store" }); refetch();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="max-w-64" placeholder="Search name or location" value={search} onChange={(e) => setSearch(e.target.value)} />
        {canManage ? <Button className="ml-auto" onClick={() => { setErr(null); setOpen(true); }}>New warehouse</Button> : null}
      </div>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refetch} /> : !data || data.data.length === 0 ? <EmptyState title="No warehouses" /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3">Name</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th>
            </tr></thead>
            <tbody>
              {data.data.map((w) => (
                <tr key={w.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">{w.name}</td>
                  <td className="px-4 py-3 text-zinc-600">{w.location ?? "-"}</td>
                  <td className="px-4 py-3 text-zinc-600">{humanize(w.type)}</td>
                  <td className="px-4 py-3"><Badge tone={w.is_active ? "green" : "zinc"}>{w.is_active ? "Active" : "Inactive"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New warehouse"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create} disabled={saving || !form.name}>{saving ? "Saving..." : "Create"}</Button></>}>
        <div className="space-y-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          <Field label="Type" hint="e.g. store, kitchen"><Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} /></Field>
          {err ? <p className="text-sm text-red-700">{err}</p> : null}
        </div>
      </Modal>
    </div>
  );
}

export function CategoriesTab({ canManage }: { canManage: boolean }) {
  const [search, setSearch] = useState("");
  const { data, loading, error, refetch } = useApi(
    () => api.list<Category>(`/product-categories?limit=100&is_active=all${search ? `&search=${encodeURIComponent(search)}` : ""}`),
    [search]
  );
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true); setErr(null);
    try {
      await api.post("/product-categories", { name: form.name, description: form.description || null });
      setOpen(false); setForm({ name: "", description: "" }); refetch();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="max-w-64" placeholder="Search name or description" value={search} onChange={(e) => setSearch(e.target.value)} />
        {canManage ? <Button className="ml-auto" onClick={() => { setErr(null); setOpen(true); }}>New category</Button> : null}
      </div>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refetch} /> : !data || data.data.length === 0 ? <EmptyState title="No categories" /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3">Name</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Status</th>
            </tr></thead>
            <tbody>
              {data.data.map((c) => (
                <tr key={c.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">{c.name}</td>
                  <td className="px-4 py-3 text-zinc-600">{c.description ?? "-"}</td>
                  <td className="px-4 py-3"><Badge tone={c.is_active ? "green" : "zinc"}>{c.is_active ? "Active" : "Inactive"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New product category"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create} disabled={saving || !form.name}>{saving ? "Saving..." : "Create"}</Button></>}>
        <div className="space-y-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          {err ? <p className="text-sm text-red-700">{err}</p> : null}
        </div>
      </Modal>
    </div>
  );
}

type Movement = {
  id: number; product_id: number; warehouse_id: number; movement_type: string;
  quantity: number; reason: string | null; reference: string | null; created_at: string;
};

export function MovementsTab() {
  const [search, setSearch] = useState("");
  const { data, loading, error, refetch } = useApi(
    () => api.list<Movement>(`/stock-movements?limit=100${search ? `&search=${encodeURIComponent(search)}` : ""}`),
    [search]
  );
  const toneFor = (t: string) => (t === "stock_in" || t === "transfer" ? "green" : t === "adjustment" ? "blue" : "red");
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="max-w-64" placeholder="Search reference or reason" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refetch} /> : !data || data.data.length === 0 ? <EmptyState title="No stock movements" /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3">When</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3">Reference</th><th className="px-4 py-3">Reason</th>
            </tr></thead>
            <tbody>
              {data.data.map((m) => (
                <tr key={m.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3 text-zinc-600">{formatDateTime(m.created_at)}</td>
                  <td className="px-4 py-3"><Badge tone={toneFor(m.movement_type)}>{humanize(m.movement_type)}</Badge></td>
                  <td className="px-4 py-3 text-right">{m.quantity}</td>
                  <td className="px-4 py-3 text-zinc-600">{m.reference ?? "-"}</td>
                  <td className="px-4 py-3 text-zinc-600">{m.reason ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
