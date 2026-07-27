"use client";

import { useState } from "react";
import { api, downloadFile, uploadForm } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, Card, EmptyState, ErrorState, LoadingState, Modal } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
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
type ImportError = { row: number; field: string | null; message: string };
type ImportReport = {
  total: number;
  valid_count: number;
  error_count: number;
  errors: ImportError[];
  preview: { row: number; sku: string; name: string; unit: string }[];
};

const UNITS = ["kg", "g", "l", "ml", "unit", "pack", "dozen", "box"];
const MOVE_TYPES = ["stock_in", "stock_out", "adjustment", "wastage", "transfer"];

export function ProductsTab({ canManage }: { canManage: boolean }) {
  const toast = useToast();
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

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);

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
      toast.success(`Product "${form.name}" created`);
      refetch();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  async function exportCsv() {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (lowOnly) q.set("low_stock", "true");
    const qs = q.toString();
    try {
      await downloadFile(`/products/export${qs ? `?${qs}` : ""}`, "products.csv");
      toast.success("Products exported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  }

  function openImport() {
    setImportFile(null);
    setImportReport(null);
    setImportErr(null);
    setShowImport(true);
  }

  function pickImportFile(f: File | null) {
    setImportFile(f);
    setImportReport(null); // a new file invalidates any prior preview
    setImportErr(null);
  }

  async function previewImport() {
    if (!importFile) return;
    setImporting(true);
    setImportErr(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      setImportReport(await uploadForm<ImportReport>("/products/import/preview", fd));
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setImporting(false);
    }
  }

  async function commitImport() {
    if (!importFile) return;
    setImporting(true);
    setImportErr(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const res = await uploadForm<{ imported: number }>("/products/import", fd);
      setShowImport(false);
      toast.success(`Imported ${res.imported} product(s)`);
      refetch();
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function downloadTemplate() {
    try {
      await downloadFile("/products/import/template", "products-import-template.csv");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download template");
    }
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
      const movedName = move.name;
      setMove(null);
      setMoveForm({ movement_type: "stock_in", quantity: "1", reason: "", direction: "increase" });
      toast.success(`Stock updated for ${movedName}`);
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
        <Button variant="secondary" className="ml-auto" onClick={exportCsv}>Export CSV</Button>
        {canManage ? <Button variant="secondary" onClick={openImport}>Import CSV</Button> : null}
        {canManage ? <Button onClick={() => { setErr(null); setShowCreate(true); }}>New product</Button> : null}
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

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import products from CSV"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowImport(false)}>Cancel</Button>
            <Button variant="secondary" onClick={previewImport} disabled={!importFile || importing}>
              {importing && !importReport ? "Checking..." : "Preview"}
            </Button>
            <Button onClick={commitImport} disabled={importing || !importReport || importReport.error_count > 0 || importReport.valid_count === 0}>
              {importReport && importReport.error_count === 0 ? `Import ${importReport.valid_count}` : "Import"}
            </Button>
          </>
        }>
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Upload a CSV with columns{" "}
            <span className="font-mono text-xs">name, sku, category, unit, cost_price, current_stock, reorder_level</span>.
            Unknown categories and existing or duplicate SKUs are rejected. Import is all-or-nothing.
          </p>
          <div className="flex items-center gap-3">
            <input type="file" accept=".csv,text/csv" onChange={(e) => pickImportFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <button onClick={downloadTemplate} className="text-sm text-blue-600 hover:underline">Download template</button>
          </div>

          {importReport ? (
            <div className="rounded-lg border border-zinc-200 p-3">
              <p className="text-sm">
                <span className="font-medium">{importReport.total}</span> rows:{" "}
                <span className="font-medium text-emerald-700">{importReport.valid_count} valid</span>,{" "}
                <span className={importReport.error_count ? "font-medium text-red-700" : "text-zinc-500"}>
                  {importReport.error_count} error{importReport.error_count === 1 ? "" : "s"}
                </span>
              </p>
              {importReport.error_count > 0 ? (
                <>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
                    {importReport.errors.map((e, i) => (
                      <li key={i} className="text-red-700">
                        Row {e.row}{e.field ? ` · ${e.field}` : ""}: {e.message}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-amber-700">Fix these rows and re-upload. Nothing is imported until every row is valid.</p>
                </>
              ) : importReport.valid_count > 0 ? (
                <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-zinc-600">
                  {importReport.preview.map((p) => (
                    <li key={p.row}><span className="font-mono">{p.sku}</span> · {p.name} · {p.unit}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {importErr ? <p className="text-sm text-red-700">{importErr}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
