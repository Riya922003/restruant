"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useClientPagination } from "@/lib/use-client-pagination";
import { useAuth } from "@/lib/auth-context";
import { StatusBadge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { useAppDialog } from "@/components/ui/app-dialog";

type Table = {
  id: number;
  label: string;
  capacity: number;
  section: string | null;
  status: string;
};

const STATUSES = ["available", "occupied", "reserved", "out_of_service"];

export default function TablesPage() {
  const toast = useToast();
  const dialog = useAppDialog();
  const { user } = useAuth();
  const canManage = user?.role === "owner" || user?.role === "manager";
  const canSetStatus = canManage || user?.role === "waiter";

  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const { data, loading, error, refetch } = useApi(
    () => api.list<Table>(`/tables?limit=100${statusFilter ? `&status=${statusFilter}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
    [statusFilter, search]
  );

  const rows = data?.data ?? [];
  const pagination = useClientPagination(rows, [statusFilter, search], 12);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ label: "", capacity: "4", section: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function createTable() {
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/tables", {
        label: form.label,
        capacity: Number(form.capacity),
        section: form.section || null,
      });
      setShowCreate(false);
      setForm({ label: "", capacity: "4", section: "" });
      toast.success("Table created");
      refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create table");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: number, status: string) {
    try {
      await api.patch(`/tables/${id}`, { status });
      toast.success("Table status updated");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  async function removeTable(id: number) {
    if (!(await dialog.confirm({ title: "Delete table", message: "Delete this table?", confirmLabel: "Delete", destructive: true }))) return;
    try {
      await api.del(`/tables/${id}`);
      toast.success("Table deleted");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Tables"
        subtitle="Dining floor and live table status"
        actions={canManage ? <Button onClick={() => setShowCreate(true)}>New table</Button> : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-48">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        <Input className="max-w-64" placeholder="Search label" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="No tables"
          description="Create a table to start seating guests."
          action={canManage ? <Button onClick={() => setShowCreate(true)}>New table</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {pagination.items.map((table) => (
            <Card key={table.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-semibold text-zinc-950">{table.label}</p>
                  <p className="text-xs text-zinc-500">
                    {table.capacity} seats{table.section ? ` · ${table.section}` : ""}
                  </p>
                </div>
                <StatusBadge value={table.status} kind="table" />
              </div>

              {canSetStatus ? (
                <Select
                  className="mt-3"
                  value={table.status}
                  onChange={(e) => changeStatus(table.id, e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </Select>
              ) : null}

              {canManage ? (
                <div className="mt-2 flex justify-end">
                  <Button variant="danger" size="sm" onClick={() => removeTable(table.id)}>
                    Delete
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}



      {!loading && !error && data && data.data.length > 0 ? (
        <Pagination {...pagination} onPageChange={pagination.setPage} />
      ) : null}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New table"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={createTable} disabled={saving || !form.label}>
              {saving ? "Saving..." : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Label">
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="T-15" />
          </Field>
          <Field label="Capacity">
            <Input
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            />
          </Field>
          <Field label="Section" hint="Optional">
            <Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="Patio" />
          </Field>
          {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
