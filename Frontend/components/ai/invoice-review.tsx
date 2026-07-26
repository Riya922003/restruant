"use client";

import { useEffect, useState } from "react";
import { aiApi, aiObjectUrl } from "@/lib/ai-api";
import { ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { Button, Card, LoadingState } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/field";
import type { ExtractedData, ImportDetail, InvoiceLineItem } from "@/types/ai";

type Supplier = { id: number; name: string };

const num = (v: string): number | null => (v === "" ? null : Number(v));

export function InvoiceReview({
  importId,
  suppliers,
  onClose,
  onChanged,
}: {
  importId: number;
  suppliers: Supplier[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ImportDetail | null>(null);
  const [ed, setEd] = useState<ExtractedData | null>(null);
  const [supplierId, setSupplierId] = useState<string>("");
  const [createExpense, setCreateExpense] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const d = await aiApi.get<ImportDetail>(`/ai/invoices/imports/${importId}`);
        if (!active) return;
        setDetail(d);
        setEd(d.extracted_data ?? emptyExtraction());
        setSupplierId(d.matched_supplier_id ? String(d.matched_supplier_id) : "");
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : "Failed to load import");
      }
      try {
        const url = await aiObjectUrl(`/ai/invoices/imports/${importId}/file`);
        if (active) setPreview(url);
      } catch {
        /* preview is best-effort */
      }
    })();
    return () => {
      active = false;
    };
  }, [importId]);

  if (error && !detail) {
    return (
      <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={onClose}>Back</Button>
        </div>
      </Card>
    );
  }
  if (!detail || !ed) return <LoadingState label="Loading extraction..." />;

  const isImage = detail.mime_type.startsWith("image/");
  const terminal = detail.status === "approved" || detail.status === "rejected";
  const lineSum = ed.line_items.reduce((s, li) => s + (li.line_total ?? 0), 0);

  function setLine(i: number, patch: Partial<InvoiceLineItem>) {
    setEd((prev) => {
      if (!prev) return prev;
      const items = prev.line_items.map((li, idx) => (idx === i ? { ...li, ...patch } : li));
      return { ...prev, line_items: items };
    });
  }

  function removeLine(i: number) {
    setEd((prev) => (prev ? { ...prev, line_items: prev.line_items.filter((_, idx) => idx !== i) } : prev));
  }

  function addLine() {
    setEd((prev) =>
      prev
        ? { ...prev, line_items: [...prev.line_items, { description: "", quantity: null, unit_price: null, line_total: null }] }
        : prev,
    );
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
      setBusy(null);
    }
  }

  const save = () =>
    run("save", () => aiApi.patch(`/ai/invoices/imports/${importId}`, { extracted_data: ed }));
  const approve = () =>
    run("approve", () =>
      aiApi.post(`/ai/invoices/imports/${importId}/approve`, {
        supplier_id: supplierId ? Number(supplierId) : null,
        create_expense_record: createExpense,
      }),
    );
  const reject = () => run("reject", () => aiApi.post(`/ai/invoices/imports/${importId}/reject`));

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">{detail.original_filename}</h2>
          <p className="text-xs text-zinc-500">
            Status: {detail.status}
            {detail.extraction_confidence != null ? ` · confidence ${detail.extraction_confidence}%` : ""}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>Back to list</Button>
      </div>

      {ed.notes ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {ed.notes}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Original file */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Original</p>
          {preview ? (
            isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="invoice" className="max-h-[520px] w-full rounded-lg border border-zinc-200 object-contain" />
            ) : (
              <iframe src={preview} title="invoice" className="h-[520px] w-full rounded-lg border border-zinc-200" />
            )
          ) : (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-zinc-200 text-sm text-zinc-400">
              Loading preview...
            </div>
          )}
        </div>

        {/* Editable extraction */}
        <div className="space-y-3">
          <Field label="Supplier">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={terminal}>
              <option value="">
                {ed.supplier_name ? `Detected: ${ed.supplier_name} (select match)` : "Select supplier"}
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Invoice #">
              <Input value={ed.invoice_number ?? ""} disabled={terminal}
                onChange={(e) => setEd({ ...ed, invoice_number: e.target.value })} />
            </Field>
            <Field label="Currency">
              <Input value={ed.currency ?? ""} disabled={terminal}
                onChange={(e) => setEd({ ...ed, currency: e.target.value })} />
            </Field>
            <Field label="Invoice date">
              <Input type="date" value={ed.invoice_date ?? ""} disabled={terminal}
                onChange={(e) => setEd({ ...ed, invoice_date: e.target.value || null })} />
            </Field>
            <Field label="Due date">
              <Input type="date" value={ed.due_date ?? ""} disabled={terminal}
                onChange={(e) => setEd({ ...ed, due_date: e.target.value || null })} />
            </Field>
            <Field label="Subtotal">
              <Input type="number" value={ed.subtotal ?? ""} disabled={terminal}
                onChange={(e) => setEd({ ...ed, subtotal: num(e.target.value) })} />
            </Field>
            <Field label="Tax">
              <Input type="number" value={ed.tax ?? ""} disabled={terminal}
                onChange={(e) => setEd({ ...ed, tax: num(e.target.value) })} />
            </Field>
            <Field label="Total">
              <Input type="number" value={ed.total ?? ""} disabled={terminal}
                onChange={(e) => setEd({ ...ed, total: num(e.target.value) })} />
            </Field>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Line items ({ed.line_items.length})
              </p>
              {!terminal ? (
                <button onClick={addLine} className="text-xs font-medium text-zinc-700 hover:text-zinc-950">
                  + Add item
                </button>
              ) : null}
            </div>
            <div className="max-h-60 overflow-y-auto rounded-lg border border-zinc-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-400">
                    <th className="px-1 py-1">Description</th>
                    <th className="w-14 px-1 py-1">Qty</th>
                    <th className="w-16 px-1 py-1">Unit</th>
                    <th className="w-20 px-1 py-1">Total</th>
                    {!terminal ? <th className="w-6" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {ed.line_items.map((li, i) => (
                    <tr key={i} className="border-t border-zinc-100">
                      <td className="p-1">
                        <Input value={li.description} disabled={terminal}
                          onChange={(e) => setLine(i, { description: e.target.value })} />
                      </td>
                      <td className="p-1">
                        <Input type="number" value={li.quantity ?? ""} disabled={terminal}
                          onChange={(e) => setLine(i, { quantity: num(e.target.value) })} />
                      </td>
                      <td className="p-1">
                        <Input type="number" value={li.unit_price ?? ""} disabled={terminal}
                          onChange={(e) => setLine(i, { unit_price: num(e.target.value) })} />
                      </td>
                      <td className="p-1">
                        <Input type="number" value={li.line_total ?? ""} disabled={terminal}
                          onChange={(e) => setLine(i, { line_total: num(e.target.value) })} />
                      </td>
                      {!terminal ? (
                        <td className="p-1 text-center">
                          <button onClick={() => removeLine(i)} className="text-zinc-400 hover:text-red-600" aria-label="Remove line">
                            ✕
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Line-item sum: {formatCurrency(lineSum)}
              {ed.total != null && Math.abs(lineSum - ed.total) > 1 ? (
                <span className="text-amber-700"> · differs from total {formatCurrency(ed.total)}</span>
              ) : null}
            </p>
          </div>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          {!terminal ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={save} disabled={!!busy}>
                {busy === "save" ? "Saving..." : "Save changes"}
              </Button>
              <Button size="sm" onClick={approve} disabled={!!busy || !supplierId}>
                {busy === "approve" ? "Approving..." : "Approve"}
              </Button>
              <Button variant="danger" size="sm" onClick={reject} disabled={!!busy}>
                Reject
              </Button>
              <label className="ml-1 flex items-center gap-1.5 text-xs text-zinc-600">
                <input type="checkbox" checked={createExpense} onChange={(e) => setCreateExpense(e.target.checked)} />
                Create expense record
              </label>
            </div>
          ) : detail.created_invoice_id ? (
            <p className="text-sm text-green-700">Approved — created invoice #{detail.created_invoice_id}.</p>
          ) : (
            <p className="text-sm text-zinc-500">This import was {detail.status}.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function emptyExtraction(): ExtractedData {
  return {
    supplier_name: null, invoice_number: null, invoice_date: null, due_date: null,
    currency: null, line_items: [], subtotal: null, tax: null, total: null,
    confidence: null, notes: null,
  };
}
