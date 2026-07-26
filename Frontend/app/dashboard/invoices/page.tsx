"use client";

import { useState } from "react";
import { api, API_BASE_URL, getToken, downloadFile } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { StatusBadge } from "@/components/ui/badge";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Button, Card, EmptyState, ErrorState, LoadingState, Modal, PageHeader } from "@/components/ui/primitives";
import { formatCurrency, formatDate } from "@/lib/formatters";

type InvoiceItem = { id: number; product_id: number | null; description: string; quantity: number; unit_price: number; line_total: number };
type Invoice = {
  id: number; invoice_number: string; supplier_id: number;
  invoice_date: string | null; due_date: string | null;
  subtotal: number; tax: number; total: number; status: string;
  file_url: string | null; notes: string | null; items?: InvoiceItem[];
};
type Supplier = { id: number; name: string };
type Category = { id: number; name: string };

const STATUSES = ["pending", "verified", "paid", "disputed"];
const OCR_NOTE = "AI/OCR auto-extraction is planned for a later phase; enter invoice details manually for now.";

// Valid next statuses per current status (label -> target).
const NEXT_STATUS: Record<string, { label: string; to: string; variant?: "secondary" | "danger" }[]> = {
  pending: [{ label: "Verify", to: "verified" }, { label: "Dispute", to: "disputed", variant: "danger" }],
  verified: [{ label: "Mark paid", to: "paid" }, { label: "Dispute", to: "disputed", variant: "danger" }],
  disputed: [{ label: "Verify", to: "verified" }, { label: "Reset to pending", to: "pending", variant: "secondary" }],
  paid: [],
};

function fileHref(file_url: string) {
  return `${API_BASE_URL.replace("/api", "")}${file_url}`;
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const canWrite = ["owner", "manager", "store_manager"].includes(user?.role ?? "");
  const canDelete = ["owner", "manager"].includes(user?.role ?? "");

  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const { data, loading, error, refetch } = useApi(
    () => api.list<Invoice>(`/supplier-invoices?limit=100${status ? `&status=${status}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
    [status, search]
  );
  const suppliers = useApi(() => api.list<Supplier>("/suppliers?limit=100"), []);
  const categories = useApi(() => api.list<Category>("/expense-categories?limit=100"), []);

  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);

  const supplierName = (id: number) => suppliers.data?.data.find((s) => s.id === id)?.name ?? `#${id}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Supplier Invoices"
        subtitle="Manual invoice entry, files, and status"
        actions={canWrite ? <Button onClick={() => setShowCreate(true)}>New invoice</Button> : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-52">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Input className="max-w-64" placeholder="Search invoice #" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button variant="secondary" className="ml-auto" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refetch} /> : !data || data.data.length === 0 ? (
        <EmptyState title="No invoices" description="Enter a supplier invoice to track it." action={canWrite ? <Button onClick={() => setShowCreate(true)}>New invoice</Button> : undefined} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3">Invoice #</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Invoice date</th>
              <th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">File</th>
            </tr></thead>
            <tbody>
              {data.data.map((inv) => (
                <tr key={inv.id} className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50" onClick={() => openDetail(inv.id)}>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-800">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-zinc-700">{supplierName(inv.supplier_id)}</td>
                  <td className="px-4 py-3 text-zinc-600">{formatDate(inv.invoice_date)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(inv.total)}</td>
                  <td className="px-4 py-3"><StatusBadge value={inv.status} kind="invoice" /></td>
                  <td className="px-4 py-3">
                    {inv.file_url ? (
                      <a href={fileHref(inv.file_url)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                        {inv.file_url.toLowerCase().endsWith(".pdf") ? "PDF" : "IMG"}
                      </a>
                    ) : <span className="text-zinc-400">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <CreateInvoiceModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        suppliers={suppliers.data?.data ?? []}
        onCreated={() => { setShowCreate(false); refetch(); }}
      />

      {detail ? (
        <DetailInvoiceModal
          invoice={detail}
          suppliers={suppliers.data?.data ?? []}
          categories={categories.data?.data ?? []}
          canDelete={canDelete}
          onClose={() => setDetail(null)}
          onRefetchDetail={async () => setDetail(await api.get<Invoice>(`/supplier-invoices/${detail.id}`))}
          onListChanged={refetch}
          onDeleted={() => { setDetail(null); refetch(); }}
        />
      ) : null}
    </div>
  );

  async function openDetail(id: number) {
    setDetail(await api.get<Invoice>(`/supplier-invoices/${id}`));
  }

  async function exportCsv() {
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (search) q.set("search", search);
    const qs = q.toString();
    try {
      await downloadFile(`/supplier-invoices/export${qs ? `?${qs}` : ""}`, "supplier-invoices.csv");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Export failed");
    }
  }
}

type LineDraft = { description: string; quantity: string; unit_price: string };

function CreateInvoiceModal({ open, onClose, suppliers, onCreated }: {
  open: boolean; onClose: () => void; suppliers: Supplier[]; onCreated: () => void;
}) {
  const [head, setHead] = useState({ invoice_number: "", supplier_id: "", invoice_date: "", due_date: "", tax: "0", notes: "" });
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [pick, setPick] = useState<LineDraft>({ description: "", quantity: "1", unit_price: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setHead({ invoice_number: "", supplier_id: "", invoice_date: "", due_date: "", tax: "0", notes: "" });
    setLines([]); setPick({ description: "", quantity: "1", unit_price: "" }); setErr(null);
  }
  function addLine() {
    if (!pick.description.trim()) return;
    setLines([...lines, { ...pick }]);
    setPick({ description: "", quantity: "1", unit_price: "" });
  }
  // Treat a filled-but-not-yet-added row as a real line so users are not blocked
  // by forgetting to click "Add". "Add" still lets them queue several lines.
  const pendingLine = pick.description.trim() !== "" ? pick : null;
  const allLines = pendingLine ? [...lines, pendingLine] : lines;
  const subtotal = allLines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0);
  const total = subtotal + Number(head.tax || 0);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await api.post("/supplier-invoices", {
        invoice_number: head.invoice_number.trim(),
        supplier_id: Number(head.supplier_id),
        invoice_date: head.invoice_date || null,
        due_date: head.due_date || null,
        tax: Number(head.tax || 0),
        notes: head.notes || null,
        items: allLines.map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unit_price: Number(l.unit_price || 0) })),
      });
      reset(); onCreated();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New invoice"
      footer={<><Button variant="secondary" onClick={() => { reset(); onClose(); }}>Cancel</Button>
        <Button onClick={submit} disabled={busy || !head.invoice_number.trim() || !head.supplier_id || allLines.length === 0}>{busy ? "Saving..." : "Create invoice"}</Button></>}>
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">{OCR_NOTE}</p>
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
          OCR autofill (coming soon)
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Invoice #"><Input value={head.invoice_number} onChange={(e) => setHead({ ...head, invoice_number: e.target.value })} /></Field>
          <Field label="Supplier"><Select value={head.supplier_id} onChange={(e) => setHead({ ...head, supplier_id: e.target.value })}><option value="">Select</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Invoice date"><Input type="date" value={head.invoice_date} onChange={(e) => setHead({ ...head, invoice_date: e.target.value })} /></Field>
          <Field label="Due date"><Input type="date" value={head.due_date} onChange={(e) => setHead({ ...head, due_date: e.target.value })} /></Field>
          <Field label="Tax"><Input type="number" value={head.tax} onChange={(e) => setHead({ ...head, tax: e.target.value })} /></Field>
        </div>
        <Field label="Notes"><Textarea rows={2} value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} /></Field>

        <div className="rounded-lg border border-zinc-200 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Line items</p>
          {lines.length === 0 ? <p className="text-sm text-zinc-500">No items yet.</p> : (
            <ul className="mb-2 space-y-1 text-sm">
              {lines.map((l, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span>{l.description} × {l.quantity} @ {formatCurrency(Number(l.unit_price || 0))}</span>
                  <button className="text-red-600 hover:underline" onClick={() => setLines(lines.filter((_, j) => j !== i))}>remove</button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2">
            <Input value={pick.description} onChange={(e) => setPick({ ...pick, description: e.target.value })} placeholder="Description" />
            <Input className="w-20" type="number" value={pick.quantity} onChange={(e) => setPick({ ...pick, quantity: e.target.value })} placeholder="Qty" />
            <Input className="w-24" type="number" value={pick.unit_price} onChange={(e) => setPick({ ...pick, unit_price: e.target.value })} placeholder="Price" />
            <Button variant="secondary" size="sm" onClick={addLine}>Add</Button>
          </div>
          <p className="mt-2 text-right text-sm text-zinc-600">Subtotal: {formatCurrency(subtotal)} · Total: {formatCurrency(total)}</p>
        </div>
        {err ? <p className="text-sm text-red-700">{err}</p> : null}
      </div>
    </Modal>
  );
}

function DetailInvoiceModal({ invoice, suppliers, categories, canDelete, onClose, onRefetchDetail, onListChanged, onDeleted }: {
  invoice: Invoice; suppliers: Supplier[]; categories: Category[]; canDelete: boolean;
  onClose: () => void; onRefetchDetail: () => Promise<void>; onListChanged: () => void; onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [categoryId, setCategoryId] = useState("");

  const supplierName = suppliers.find((s) => s.id === invoice.supplier_id)?.name ?? `#${invoice.supplier_id}`;
  const canExpense = invoice.status === "verified" || invoice.status === "paid";

  async function refresh() { await onRefetchDetail(); onListChanged(); }

  async function transition(to: string) {
    setBusy(true);
    try { await api.post(`/supplier-invoices/${invoice.id}/status`, { status: to }); await refresh(); }
    catch (e) { alert(e instanceof Error ? e.message : "Status change failed"); }
    finally { setBusy(false); }
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE_URL}/supplier-invoices/${invoice.id}/file`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.message || "Upload failed");
      setFile(null); await refresh();
    } catch (e) { alert(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); }
  }

  async function bookExpense() {
    if (!categoryId) return;
    setBusy(true);
    try {
      await api.post(`/supplier-invoices/${invoice.id}/expense`, { category_id: Number(categoryId) });
      alert("Expense booked (idempotent — safe to retry).");
      await refresh();
    } catch (e) { alert(e instanceof Error ? e.message : "Failed to book expense"); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm("Delete this invoice?")) return;
    setBusy(true);
    try { await api.del(`/supplier-invoices/${invoice.id}`); onDeleted(); }
    catch (e) { alert(e instanceof Error ? e.message : "Delete failed"); setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={invoice.invoice_number}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {NEXT_STATUS[invoice.status]?.map((t) => (
              <Button key={t.to} variant={t.variant ?? "secondary"} disabled={busy} onClick={() => transition(t.to)}>{t.label}</Button>
            ))}
          </div>
          {canDelete ? <Button variant="danger" disabled={busy} onClick={remove}>Delete</Button> : null}
        </div>
      }>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={invoice.status} kind="invoice" />
          <span className="text-sm text-zinc-700">{supplierName}</span>
          <span className="text-sm text-zinc-500">· Invoice {formatDate(invoice.invoice_date)} · Due {formatDate(invoice.due_date)}</span>
        </div>

        <p className="text-xs text-zinc-500">{OCR_NOTE}</p>

        <table className="w-full text-sm">
          <thead><tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
            <th className="py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit price</th><th className="py-2 text-right">Line total</th>
          </tr></thead>
          <tbody>
            {invoice.items?.map((it) => (
              <tr key={it.id} className="border-b border-zinc-100">
                <td className="py-2">{it.description}</td>
                <td className="py-2 text-right">{it.quantity}</td>
                <td className="py-2 text-right">{formatCurrency(it.unit_price)}</td>
                <td className="py-2 text-right">{formatCurrency(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-right text-sm text-zinc-700">
          <p>Subtotal {formatCurrency(invoice.subtotal)} · Tax {formatCurrency(invoice.tax)}</p>
          <p className="text-base font-semibold text-zinc-950">Total {formatCurrency(invoice.total)}</p>
        </div>
        {invoice.notes ? <p className="text-sm text-zinc-600">{invoice.notes}</p> : null}

        {/* File upload & review */}
        <div className="rounded-lg border border-zinc-200 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Invoice file</p>
          {invoice.file_url ? (
            <p className="mb-2 text-sm">
              <a href={fileHref(invoice.file_url)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">View uploaded file</a>
            </p>
          ) : <p className="mb-2 text-sm text-zinc-500">No file uploaded yet.</p>}
          <div className="flex items-center gap-2">
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <Button variant="secondary" size="sm" disabled={busy || !file} onClick={upload}>Upload</Button>
          </div>
        </div>

        {/* Generate expense */}
        {canExpense ? (
          <div className="rounded-lg border border-zinc-200 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Book as expense</p>
            <div className="flex items-end gap-2">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="max-w-56">
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Button variant="secondary" size="sm" disabled={busy || !categoryId} onClick={bookExpense}>Book as expense</Button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">Idempotent — booking again reuses the same expense.</p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
