"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Button, Card, EmptyState, ErrorState, LoadingState, Modal } from "@/components/ui/primitives";

type Category = { id: number; name: string; description: string | null; is_active: boolean };

export function CategoriesTab({ canManage }: { canManage: boolean }) {
  const { data, loading, error, refetch } = useApi(
    () => api.list<Category>("/expense-categories?limit=100&is_active=all"),
    []
  );

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    setErr(null);
    try {
      await api.post("/expense-categories", { name: form.name, description: form.description || null });
      setOpen(false);
      setForm({ name: "", description: "" });
      refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(c: Category) {
    if (!confirm(`Deactivate ${c.name}?`)) return;
    try {
      await api.del(`/expense-categories/${c.id}`);
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to deactivate");
    }
  }

  return (
    <div>
      {canManage ? (
        <div className="mb-4 flex justify-end">
          <Button
            onClick={() => {
              setErr(null);
              setForm({ name: "", description: "" });
              setOpen(true);
            }}
          >
            New category
          </Button>
        </div>
      ) : null}

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState title="No expense categories" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Status</th>
                {canManage ? <th className="px-4 py-3 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.data.map((c) => (
                <tr key={c.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">{c.name}</td>
                  <td className="px-4 py-3 text-zinc-600">{c.description ?? "-"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={c.is_active ? "green" : "zinc"}>{c.is_active ? "Active" : "Inactive"}</Badge>
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {c.is_active ? (
                          <Button variant="danger" size="sm" onClick={() => deactivate(c)}>
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
        title="New expense category"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={saving || !form.name}>
              {saving ? "Saving..." : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          {err ? <p className="text-sm text-red-700">{err}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
