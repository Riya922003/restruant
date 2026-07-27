"use client";

import { useState } from "react";
import { api, downloadFile } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Button, Card, EmptyState, ErrorState, LoadingState, Modal, StatCard } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate, humanize } from "@/lib/formatters";

type ExpenseRecord = {
  id: number;
  category_id: number;
  supplier_id: number | null;
  invoice_id: number | null;
  description: string | null;
  amount: number;
  expense_date: string;
  payment_method: string | null;
  reference: string | null;
  created_by: number | null;
};
type Category = { id: number; name: string; is_active: boolean };
type Ref = { id: number; name: string };

const PAYMENT_METHODS = ["cash", "card", "upi", "bank_transfer", "other"];
const EMPTY = {
  category_id: "",
  amount: "",
  expense_date: "",
  payment_method: "",
  supplier_id: "",
  reference: "",
  description: "",
};

export function RecordsTab({ canWrite, canDelete }: { canWrite: boolean; canDelete: boolean }) {
  const toast = useToast();
  const [categoryId, setCategoryId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");

  const { data, loading, error, refetch } = useApi(
    () =>
      api.list<ExpenseRecord>(
        `/expense-records?limit=100${categoryId ? `&category_id=${categoryId}` : ""}${
          fromDate ? `&from_date=${fromDate}` : ""
        }${toDate ? `&to_date=${toDate}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`
      ),
    [categoryId, fromDate, toDate, search]
  );
  const cats = useApi(() => api.list<Category>("/expense-categories?limit=100"), []);
  const sups = useApi(() => api.list<Ref>("/suppliers?limit=100"), []);

  const catName = (id: number) => cats.data?.data.find((c) => c.id === id)?.name ?? "-";
  const total = (data?.data ?? []).reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFormError(null);
    setOpen(true);
  }
  function openEdit(r: ExpenseRecord) {
    setEditing(r);
    setForm({
      category_id: String(r.category_id),
      amount: String(r.amount),
      expense_date: r.expense_date ? r.expense_date.slice(0, 10) : "",
      payment_method: r.payment_method ?? "",
      supplier_id: r.supplier_id ? String(r.supplier_id) : "",
      reference: r.reference ?? "",
      description: r.description ?? "",
    });
    setFormError(null);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    const body = {
      category_id: Number(form.category_id),
      amount: Number(form.amount),
      expense_date: form.expense_date,
      payment_method: form.payment_method || null,
      supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
      reference: form.reference || null,
      description: form.description.trim(),
    };
    try {
      if (editing) await api.patch(`/expense-records/${editing.id}`, body);
      else await api.post("/expense-records", body);
      setOpen(false);
      toast.success("Expense saved");
      refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save expense");
    } finally {
      setSaving(false);
    }
  }

  async function exportCsv() {
    const q = new URLSearchParams();
    if (categoryId) q.set("category_id", categoryId);
    if (fromDate) q.set("from_date", fromDate);
    if (toDate) q.set("to_date", toDate);
    if (search) q.set("search", search);
    const qs = q.toString();
    try {
      await downloadFile(`/expense-records/export${qs ? `?${qs}` : ""}`, "expense-register.csv");
      toast.success("Expenses exported");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function remove(r: ExpenseRecord) {
    if (!confirm("Delete this expense record?")) return;
    try {
      await api.del(`/expense-records/${r.id}`);
      toast.success("Expense deleted");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="max-w-48">
          <option value="">All categories</option>
          {cats.data?.data.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input type="date" className="max-w-40" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input type="date" className="max-w-40" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <Input
          className="max-w-xs"
          placeholder="Search description, reference"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="secondary" className="ml-auto" onClick={exportCsv}>
          Export CSV
        </Button>
        {canWrite ? (
          <Button onClick={openCreate}>
            New expense
          </Button>
        ) : null}
      </div>

      {!loading && !error && data && data.data.length > 0 ? (
        <div className="mb-4">
          <StatCard label="Total (listed)" value={formatCurrency(total)} hint={`${data.data.length} records`} />
        </div>
      ) : null}

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="No expense records"
          description="Log an expense to start tracking spend."
          action={canWrite ? <Button onClick={openCreate}>New expense</Button> : undefined}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3 text-right">Amount</th>
                {canWrite ? <th className="px-4 py-3 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.data.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3 text-zinc-600">{formatDate(r.expense_date)}</td>
                  <td className="px-4 py-3 font-medium text-zinc-900">{catName(r.category_id)}</td>
                  <td className="px-4 py-3 text-zinc-600">{r.description ?? "-"}</td>
                  <td className="px-4 py-3 text-zinc-600">{humanize(r.payment_method)}</td>
                  <td className="px-4 py-3 text-right font-medium text-zinc-900">{formatCurrency(r.amount)}</td>
                  {canWrite ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(r)}>
                          Edit
                        </Button>
                        {canDelete ? (
                          <Button variant="danger" size="sm" onClick={() => remove(r)}>
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit expense" : "New expense"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !form.category_id || !form.amount || !form.expense_date || !form.description.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">Select...</option>
                {cats.data?.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount">
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              />
            </Field>
            <Field label="Payment method">
              <Select
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              >
                <option value="">None</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {humanize(m)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Supplier">
              <Select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">None</option>
                {sups.data?.data.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reference">
              <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </Field>
          </div>
          <Field label="Description (required)">
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
