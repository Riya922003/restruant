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

type Recipe = {
  id: number;
  menu_item_id: number;
  menu_item_name: string;
  yield_servings: number;
  instructions: string | null;
  prep_time_minutes: number | null;
  ingredient_count?: number;
};

type IngredientLine = {
  id: number;
  ingredient_id: number;
  ingredient_name: string;
  quantity: number;
  unit: string;
};

type RecipeDetail = Recipe & { ingredients: IngredientLine[] };

type MenuItem = { id: number; name: string };
type Ingredient = { id: number; name: string; unit: string };

type FormLine = { ingredient_id: string; quantity: string; unit: string };

const UNITS = ["kg", "g", "l", "ml", "unit", "pack", "dozen", "box"];

export default function RecipesPage() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage =
    user?.role === "owner" || user?.role === "manager" || user?.role === "chef";

  const [search, setSearch] = useState("");
  const { data, loading, error, refetch } = useApi(
    () => api.list<Recipe>(`/recipes?limit=100${search ? `&search=${encodeURIComponent(search)}` : ""}`),
    [search]
  );

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const detail = useApi<RecipeDetail | null>(
    () => (selectedId ? api.get<RecipeDetail>(`/recipes/${selectedId}`) : Promise.resolve(null)),
    [selectedId]
  );

  const [showCreate, setShowCreate] = useState(false);

  async function removeRecipe(id: number) {
    if (!confirm("Delete this recipe?")) return;
    try {
      await api.del(`/recipes/${id}`);
      if (selectedId === id) setSelectedId(null);
      toast.success("Recipe deleted");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function removeLine(recipeId: number, lineId: number) {
    if (!confirm("Remove this ingredient?")) return;
    try {
      await api.del(`/recipes/${recipeId}/ingredients/${lineId}`);
      toast.success("Ingredient removed");
      detail.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  const rec = detail.data;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Recipes"
        subtitle="Ingredient bill-of-materials per dish"
        actions={canManage ? <Button onClick={() => setShowCreate(true)}>New recipe</Button> : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by dish..."
          className="max-w-72"
        />
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="No recipes"
          description="Create a recipe to define a dish's ingredients."
          action={canManage ? <Button onClick={() => setShowCreate(true)}>New recipe</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="overflow-hidden lg:col-span-2">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Dish</th>
                  <th className="px-4 py-2 font-medium">Servings</th>
                  <th className="px-4 py-2 font-medium">Prep</th>
                  <th className="px-4 py-2 font-medium">Ingredients</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-zinc-50 ${
                      selectedId === r.id ? "bg-zinc-50" : ""
                    }`}
                  >
                    <td className="px-4 py-2 font-medium text-zinc-950">{r.menu_item_name}</td>
                    <td className="px-4 py-2 text-zinc-700">{r.yield_servings}</td>
                    <td className="px-4 py-2 text-zinc-700">
                      {r.prep_time_minutes != null ? `${r.prep_time_minutes} min` : "-"}
                    </td>
                    <td className="px-4 py-2 text-zinc-700">
                      {r.ingredient_count != null ? r.ingredient_count : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-4">
            {!selectedId ? (
              <p className="text-sm text-zinc-500">Select a recipe to view its ingredients.</p>
            ) : detail.loading ? (
              <p className="text-sm text-zinc-500">Loading...</p>
            ) : detail.error ? (
              <p className="text-sm text-red-700">{detail.error}</p>
            ) : rec ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-semibold text-zinc-950">{rec.menu_item_name}</p>
                    <p className="text-xs text-zinc-500">
                      {rec.yield_servings} servings
                      {rec.prep_time_minutes != null ? ` · ${rec.prep_time_minutes} min` : ""}
                    </p>
                  </div>
                  {canManage ? (
                    <Button variant="danger" size="sm" onClick={() => removeRecipe(rec.id)}>
                      Delete
                    </Button>
                  ) : null}
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Ingredients</p>
                  {rec.ingredients.length === 0 ? (
                    <p className="text-sm text-zinc-500">No ingredients listed.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody>
                        {rec.ingredients.map((line) => (
                          <tr key={line.id} className="border-b border-zinc-100 last:border-0">
                            <td className="py-1.5 text-zinc-800">{line.ingredient_name}</td>
                            <td className="py-1.5 text-right text-zinc-600">
                              <Badge>
                                {line.quantity} {line.unit}
                              </Badge>
                            </td>
                            {canManage ? (
                              <td className="py-1.5 pl-2 text-right">
                                <Button variant="ghost" size="sm" onClick={() => removeLine(rec.id, line.id)}>
                                  ✕
                                </Button>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {rec.instructions ? (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Instructions</p>
                    <p className="whitespace-pre-wrap text-sm text-zinc-700">{rec.instructions}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>
        </div>
      )}

      {showCreate ? (
        <CreateRecipeModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function CreateRecipeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const menuItems = useApi(() => api.list<MenuItem>("/menu-items?limit=100"), []);
  const ingredients = useApi<Ingredient[]>(async () => {
    try {
      const res = await api.list<Ingredient>("/ingredients?limit=200");
      return res.data;
    } catch {
      return [];
    }
  }, []);
  const hasIngredientList = (ingredients.data?.length ?? 0) > 0;

  const [form, setForm] = useState({
    menu_item_id: "",
    yield_servings: "1",
    prep_time_minutes: "",
    instructions: "",
  });
  const [lines, setLines] = useState<FormLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function addLine() {
    setLines([...lines, { ingredient_id: "", quantity: "", unit: "unit" }]);
  }
  function setLine(i: number, patch: Partial<FormLine>) {
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines(lines.filter((_, idx) => idx !== i));
  }

  async function createRecipe() {
    setSaving(true);
    setFormError(null);
    try {
      const ingredientPayload = lines
        .filter((l) => l.ingredient_id && l.quantity)
        .map((l) => ({ ingredient_id: Number(l.ingredient_id), quantity: Number(l.quantity), unit: l.unit }));
      await api.post("/recipes", {
        menu_item_id: Number(form.menu_item_id),
        yield_servings: Number(form.yield_servings),
        prep_time_minutes: form.prep_time_minutes ? Number(form.prep_time_minutes) : undefined,
        instructions: form.instructions || undefined,
        ...(ingredientPayload.length ? { ingredients: ingredientPayload } : {}),
      });
      toast.success("Recipe created");
      onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create recipe");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New recipe"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={createRecipe} disabled={saving || !form.menu_item_id}>
            {saving ? "Saving..." : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Menu item">
          <Select
            value={form.menu_item_id}
            onChange={(e) => setForm({ ...form, menu_item_id: e.target.value })}
          >
            <option value="">Select a dish...</option>
            {menuItems.data?.data.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Yield servings">
            <Input
              type="number"
              min={1}
              value={form.yield_servings}
              onChange={(e) => setForm({ ...form, yield_servings: e.target.value })}
            />
          </Field>
          <Field label="Prep time (min)" hint="Optional">
            <Input
              type="number"
              min={0}
              value={form.prep_time_minutes}
              onChange={(e) => setForm({ ...form, prep_time_minutes: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Instructions" hint="Optional">
          <Textarea
            rows={3}
            value={form.instructions ?? ""}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
        </Field>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-700">Ingredients</span>
            <Button variant="secondary" size="sm" onClick={addLine}>
              Add
            </Button>
          </div>
          {lines.length === 0 ? (
            <p className="text-xs text-zinc-500">No ingredients added yet.</p>
          ) : (
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="flex items-center gap-2">
                  {hasIngredientList ? (
                    <Select
                      value={line.ingredient_id}
                      onChange={(e) => {
                        const ing = ingredients.data?.find((x) => String(x.id) === e.target.value);
                        setLine(i, { ingredient_id: e.target.value, ...(ing ? { unit: ing.unit } : {}) });
                      }}
                    >
                      <option value="">Ingredient...</option>
                      {ingredients.data?.map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      type="number"
                      placeholder="Ingredient ID"
                      value={line.ingredient_id}
                      onChange={(e) => setLine(i, { ingredient_id: e.target.value })}
                    />
                  )}
                  <Input
                    type="number"
                    placeholder="Qty"
                    className="max-w-24"
                    value={line.quantity}
                    onChange={(e) => setLine(i, { quantity: e.target.value })}
                  />
                  <Select
                    className="max-w-28"
                    value={line.unit}
                    onChange={(e) => setLine(i, { unit: e.target.value })}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => removeLine(i)}>
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
      </div>
    </Modal>
  );
}
