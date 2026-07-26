import type { UserRole } from "@/types/roles";

// Sidebar navigation with the roles allowed to see each item. Owner sees
// everything (handled in the filter). This gating is UX only; the backend
// enforces real authorization per the RBAC matrix (phase-01 spec 04).
export type NavItem = {
  label: string;
  href: string;
  roles: UserRole[];
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/dashboard", roles: ["owner", "manager", "chef", "waiter", "cashier", "store_manager"] },
  { label: "Orders", href: "/dashboard/orders", roles: ["manager", "chef", "waiter", "cashier"] },
  { label: "Tables", href: "/dashboard/tables", roles: ["manager", "chef", "waiter", "cashier"] },
  { label: "Menu", href: "/dashboard/menu", roles: ["manager", "chef", "waiter", "cashier"] },
  { label: "Recipes", href: "/dashboard/recipes", roles: ["manager", "chef", "waiter"] },
  { label: "Suppliers", href: "/dashboard/suppliers", roles: ["manager", "store_manager"] },
  { label: "Inventory", href: "/dashboard/inventory", roles: ["manager", "store_manager"] },
  { label: "Purchases", href: "/dashboard/purchases", roles: ["manager", "store_manager"] },
  { label: "Invoices", href: "/dashboard/invoices", roles: ["manager", "store_manager"] },
  { label: "Expenses", href: "/dashboard/expenses", roles: ["manager", "store_manager", "cashier"] },
  { label: "Staff", href: "/dashboard/staff", roles: ["manager"] },
  { label: "Activity", href: "/dashboard/activity", roles: ["manager"] },
  { label: "AI Insights", href: "/dashboard/ai-insights", roles: ["manager", "store_manager", "chef"] },
  { label: "Invoice AI", href: "/dashboard/invoice-ai", roles: ["manager", "store_manager"] },
];

export function navForRole(role: UserRole): NavItem[] {
  if (role === "owner") return NAV_ITEMS;
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
