const { insert } = require("./helpers");

// Reference and lookup data with few or no foreign keys: restaurant profile,
// suppliers, warehouses, the two category families, expense categories, and
// dining tables. Populates ctx with id lookups used by later seed modules.

const SUPPLIERS = [
  { name: "Fresh Farms Produce", contact_name: "Ravi Menon", email: "orders@freshfarms.test", phone: "+91 98200 11001", address: "12 Market Yard, Pune", payment_terms: "Net 30" },
  { name: "Metro Meat & Poultry", contact_name: "Aisha Khan", email: "sales@metromeat.test", phone: "+91 98200 11002", address: "5 Cold Chain Rd, Mumbai", payment_terms: "Net 15" },
  { name: "DairyBest Supplies", contact_name: "Sunil Rao", email: "hello@dairybest.test", phone: "+91 98200 11003", address: "88 Creamery Ln, Nashik", payment_terms: "Net 30" },
  { name: "Sunrise Beverages", contact_name: "Neha Joshi", email: "b2b@sunrisebev.test", phone: "+91 98200 11004", address: "23 Bottling Ave, Thane", payment_terms: "Net 45" },
  { name: "PackRight Packaging", contact_name: "Imran Shaikh", email: "supply@packright.test", phone: "+91 98200 11005", address: "3 Industrial Estate, Pune", payment_terms: "Net 30" },
  { name: "CleanCo Supplies", contact_name: "Meera Nair", email: "care@cleanco.test", phone: "+91 98200 11006", address: "41 Service Rd, Mumbai", payment_terms: "Net 30" },
];

const WAREHOUSES = [
  { name: "Main Store", location: "Ground Floor", type: "store" },
  { name: "Kitchen Store", location: "Kitchen Wing", type: "kitchen" },
  { name: "Cold Storage", location: "Basement", type: "store" },
];

const PRODUCT_CATEGORIES = [
  { name: "Dry Goods", description: "Shelf-stable staples and packaged goods" },
  { name: "Beverages", description: "Bottled and canned drinks" },
  { name: "Packaging", description: "Takeaway and service packaging" },
  { name: "Cleaning", description: "Cleaning and hygiene supplies" },
  { name: "Dairy", description: "Refrigerated dairy stock" },
];

const MENU_CATEGORIES = [
  { name: "Starters", description: "Small plates and appetizers", sort_order: 1 },
  { name: "Mains", description: "Signature curries and mains", sort_order: 2 },
  { name: "Breads", description: "Tandoor breads", sort_order: 3 },
  { name: "Rice & Biryani", description: "Rice dishes and biryanis", sort_order: 4 },
  { name: "Desserts", description: "Sweets and desserts", sort_order: 5 },
  { name: "Beverages", description: "Hot and cold drinks", sort_order: 6 },
];

const EXPENSE_CATEGORIES = [
  { name: "Rent", description: "Premises rent" },
  { name: "Utilities", description: "Electricity, water, gas, internet" },
  { name: "Salaries", description: "Staff wages and salaries" },
  { name: "Supplies", description: "Kitchen and operating supplies" },
  { name: "Maintenance", description: "Repairs and upkeep" },
  { name: "Marketing", description: "Advertising and promotions" },
];

const SECTIONS = ["Indoor", "Patio", "Bar"];

async function seedReference(client, ctx) {
  await insert(client, "restaurant_profile", {
    id: 1,
    name: "Spice Route Kitchen",
    address: "221 Riverside Promenade, Pune, MH 411001",
    phone: "+91 20 4000 2210",
    email: "hello@spiceroute.test",
    currency_code: "INR",
    tax_rate: 5.0,
    timezone: "Asia/Kolkata",
  });
  ctx.taxRate = 5.0;

  ctx.suppliers = [];
  for (const s of SUPPLIERS) {
    const { id } = await insert(client, "suppliers", s);
    ctx.suppliers.push(id);
  }

  ctx.warehouses = [];
  for (const w of WAREHOUSES) {
    const { id } = await insert(client, "warehouses", w);
    ctx.warehouses.push(id);
  }

  ctx.productCategories = {};
  for (const c of PRODUCT_CATEGORIES) {
    const { id } = await insert(client, "product_categories", c);
    ctx.productCategories[c.name] = id;
  }

  ctx.menuCategories = {};
  for (const c of MENU_CATEGORIES) {
    const { id } = await insert(client, "menu_categories", c);
    ctx.menuCategories[c.name] = id;
  }

  ctx.expenseCategories = {};
  for (const c of EXPENSE_CATEGORIES) {
    const { id } = await insert(client, "expense_categories", c);
    ctx.expenseCategories[c.name] = id;
  }

  // 14 tables across three sections; most available, a few reserved. Occupancy
  // from active orders is applied later in the orders seed.
  ctx.tables = [];
  for (let i = 1; i <= 14; i += 1) {
    const capacity = i % 3 === 0 ? 6 : i % 2 === 0 ? 4 : 2;
    const status = i === 4 || i === 9 ? "reserved" : "available";
    const { id } = await insert(client, "restaurant_tables", {
      label: `T${i}`,
      capacity,
      section: SECTIONS[i % SECTIONS.length],
      status,
    });
    ctx.tables.push({ id, status });
  }
}

module.exports = { seedReference };
