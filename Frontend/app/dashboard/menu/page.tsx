"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
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
import { useAppDialog } from "@/components/ui/app-dialog";
import { formatCurrency } from "@/lib/formatters";

type Category = {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

type MenuItem = {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  price: number;
  cost: number | null;
  prep_time_minutes: number | null;
  is_available: boolean;
  is_active: boolean;
  image_url: string | null;
};

export default function MenuPage() {
  const toast = useToast();
  const dialog = useAppDialog();
  const { user } = useAuth();
  const canManage = user?.role === "owner" || user?.role === "manager";
  const canToggle = canManage || user?.role === "chef";

  const [categoryFilter, setCategoryFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("");
  const [search, setSearch] = useState("");

  const categories = useApi(
    () => api.list<Category>("/menu-categories?limit=100&include=items"),
    []
  );

  const { data, loading, error, refetch } = useApi(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (categoryFilter) params.set("category_id", categoryFilter);
    if (availabilityFilter) params.set("is_available", availabilityFilter);
    if (search) params.set("search", search);
    return api.list<MenuItem>(`/menu-items?${params.toString()}`);
  }, [categoryFilter, availabilityFilter, search]);

  const categoryName = (id: number) =>
    categories.data?.data.find((c) => c.id === id)?.name ?? "-";

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    category_id: "",
    name: "",
    price: "",
    cost: "",
    prep_time_minutes: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function createItem() {
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/menu-items", {
        category_id: Number(form.category_id),
        name: form.name,
        price: Number(form.price),
        ...(form.cost ? { cost: Number(form.cost) } : {}),
        ...(form.prep_time_minutes
          ? { prep_time_minutes: Number(form.prep_time_minutes) }
          : {}),
        ...(form.description ? { description: form.description } : {}),
      });
      setShowCreate(false);
      const createdName = form.name;
      setForm({
        category_id: "",
        name: "",
        price: "",
        cost: "",
        prep_time_minutes: "",
        description: "",
      });
      toast.success(`Menu item "${createdName}" created`);
      refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailability(item: MenuItem) {
    try {
      await api.patch(`/menu-items/${item.id}/availability`, {
        is_available: !item.is_available,
      });
      toast.success(item.is_available ? "Marked unavailable" : "Marked available");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update availability");
    }
  }

  async function removeItem(id: number) {
    if (!(await dialog.confirm({ title: "Delete menu item", message: "Delete this item?", confirmLabel: "Delete", destructive: true }))) return;
    try {
      await api.del(`/menu-items/${id}`);
      toast.success("Menu item deleted");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Menu"
        subtitle="Menu categories and items"
        actions={canManage ? <Button onClick={() => setShowCreate(true)}>New item</Button> : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="max-w-48"
        >
          <option value="">All categories</option>
          {categories.data?.data.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          value={availabilityFilter}
          onChange={(e) => setAvailabilityFilter(e.target.value)}
          className="max-w-48"
        >
          <option value="">All</option>
          <option value="true">Available</option>
          <option value="false">Unavailable</option>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items"
          className="max-w-64"
        />
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="No items"
          description="Create a menu item to get started."
          action={canManage ? <Button onClick={() => setShowCreate(true)}>New item</Button> : undefined}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Price</th>
                <th className="px-4 py-2.5 font-medium">Prep</th>
                <th className="px-4 py-2.5 font-medium">Availability</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.data.map((item) => (
                <tr key={item.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-2.5 font-medium text-zinc-950">{item.name}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{categoryName(item.category_id)}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{formatCurrency(item.price)}</td>
                  <td className="px-4 py-2.5 text-zinc-600">
                    {item.prep_time_minutes != null ? `${item.prep_time_minutes} min` : "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={item.is_available ? "green" : "zinc"}>
                      {item.is_available ? "Available" : "Unavailable"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-2">
                      {canToggle ? (
                        <Button variant="secondary" size="sm" onClick={() => toggleAvailability(item)}>
                          {item.is_available ? "Mark unavailable" : "Mark available"}
                        </Button>
                      ) : null}
                      {canManage ? (
                        <Button variant="danger" size="sm" onClick={() => removeItem(item.id)}>
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New item"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={createItem}
              disabled={saving || !form.category_id || !form.name || !form.price}
            >
              {saving ? "Saving..." : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Category">
            <Select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">Select a category</option>
              {categories.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Margherita Pizza"
            />
          </Field>
          <Field label="Price">
            <Input
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </Field>
          <Field label="Cost" hint="Optional">
            <Input
              type="number"
              min={0}
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
            />
          </Field>
          <Field label="Prep time (minutes)" hint="Optional">
            <Input
              type="number"
              min={0}
              value={form.prep_time_minutes}
              onChange={(e) => setForm({ ...form, prep_time_minutes: e.target.value })}
            />
          </Field>
          <Field label="Description" hint="Optional">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
