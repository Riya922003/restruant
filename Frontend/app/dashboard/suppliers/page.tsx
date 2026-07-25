"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
} from "@/components/ui/primitives";

type Supplier = {
  id: number;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  payment_terms: string | null;
  is_active: boolean;
};

const EMPTY = { name: "", contact_name: "", email: "", phone: "", address: "", payment_terms: "" };

export default function SuppliersPage() {
  const { user } = useAuth();
  const canManage = ["owner", "manager", "store_manager"].includes(user?.role ?? "");

  const [search, setSearch] = useState("");
  const [active, setActive] = useState("true");
  const { data, loading, error, refetch } = useApi(
    () => api.list<Supplier>(`/suppliers?limit=100&is_active=${active}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
    [search, active]
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFormError(null);
    setOpen(true);
  }
  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      contact_name: s.contact_name ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      address: s.address ?? "",
      payment_terms: s.payment_terms ?? "",
    });
    setFormError(null);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    const body = {
      name: form.name,
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      payment_terms: form.payment_terms || null,
    };
    try {
      if (editing) await api.patch(`/suppliers/${editing.id}`, body);
      else await api.post("/suppliers", body);
      setOpen(false);
      refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save supplier");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(s: Supplier) {
    if (!confirm(`Deactivate ${s.name}?`)) return;
    try {
      await api.del(`/suppliers/${s.id}`);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to deactivate");
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Suppliers"
        subtitle="Vendors and payment terms"
        actions={canManage ? <Button onClick={openCreate}>New supplier</Button> : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search name, contact, email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={active} onChange={(e) => setActive(e.target.value)} className="max-w-40">
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="all">All</option>
        </Select>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState title="No suppliers" description="Add a supplier to start purchasing." action={canManage ? <Button onClick={openCreate}>New supplier</Button> : undefined} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Terms</th>
                <th className="px-4 py-3">Status</th>
                {canManage ? <th className="px-4 py-3 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.data.map((s) => (
                <tr key={s.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">{s.name}</td>
                  <td className="px-4 py-3 text-zinc-600">{s.contact_name ?? "-"}</td>
                  <td className="px-4 py-3 text-zinc-600">{s.email ?? "-"}</td>
                  <td className="px-4 py-3 text-zinc-600">{s.phone ?? "-"}</td>
                  <td className="px-4 py-3 text-zinc-600">{s.payment_terms ?? "-"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={s.is_active ? "green" : "zinc"}>{s.is_active ? "Active" : "Inactive"}</Badge>
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(s)}>
                          Edit
                        </Button>
                        {s.is_active ? (
                          <Button variant="danger" size="sm" onClick={() => deactivate(s)}>
                            Deactivate
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
        title={editing ? "Edit supplier" : "New supplier"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !form.name}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact name">
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </Field>
            <Field label="Payment terms">
              <Input value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="Net 30" />
            </Field>
            <Field label="Email">
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          <Field label="Address">
            <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
          </Field>
          {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
