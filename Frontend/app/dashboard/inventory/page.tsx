"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/ui/primitives";
import { ProductsTab } from "@/components/inventory/products-tab";
import { IngredientsTab } from "@/components/inventory/ingredients-tab";
import { WarehousesTab, CategoriesTab, MovementsTab } from "@/components/inventory/misc-tabs";

const TABS = ["Products", "Ingredients", "Warehouses", "Categories", "Movements"] as const;
type Tab = (typeof TABS)[number];

export default function InventoryPage() {
  const { user } = useAuth();
  const canManage = ["owner", "manager", "store_manager"].includes(user?.role ?? "");
  const [tab, setTab] = useState<Tab>("Products");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Inventory" subtitle="Products, ingredients, warehouses, and the stock ledger" />

      <div className="mb-5 flex flex-wrap gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Products" ? <ProductsTab canManage={canManage} /> : null}
      {tab === "Ingredients" ? <IngredientsTab /> : null}
      {tab === "Warehouses" ? <WarehousesTab canManage={canManage} /> : null}
      {tab === "Categories" ? <CategoriesTab canManage={canManage} /> : null}
      {tab === "Movements" ? <MovementsTab /> : null}
    </div>
  );
}
