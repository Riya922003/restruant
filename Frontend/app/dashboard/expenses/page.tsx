"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/ui/primitives";
import { RecordsTab } from "@/components/expenses/records-tab";
import { CategoriesTab } from "@/components/expenses/categories-tab";
import { MonthlyTab } from "@/components/expenses/monthly-tab";

const TABS = ["Records", "Categories", "Monthly"] as const;
type Tab = (typeof TABS)[number];

export default function ExpensesPage() {
  const { user } = useAuth();
  const role = user?.role ?? "";
  const canWrite = ["owner", "manager", "store_manager"].includes(role);
  const canManageCategories = ["owner", "manager"].includes(role);
  const [tab, setTab] = useState<Tab>("Records");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Expenses" subtitle="Spend records, categories, and monthly totals" />

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

      {tab === "Records" ? <RecordsTab canWrite={canWrite} canDelete={canManageCategories} /> : null}
      {tab === "Categories" ? <CategoriesTab canManage={canManageCategories} /> : null}
      {tab === "Monthly" ? <MonthlyTab /> : null}
    </div>
  );
}
