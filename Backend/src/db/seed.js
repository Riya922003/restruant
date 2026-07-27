const { pool } = require("../config/database");
const { makeRng, resolveAsOf } = require("./seeds/helpers");
const { seedReference } = require("./seeds/reference.seed");
const { seedUsers } = require("./seeds/users.seed");
const { seedCatalog } = require("./seeds/catalog.seed");
const { seedRecipes } = require("./seeds/recipes.seed");
const { seedPurchasing } = require("./seeds/purchasing.seed");
const { seedExpenses } = require("./seeds/expenses.seed");
const { seedOrders } = require("./seeds/orders.seed");

// Tables truncated before reseeding, in an order that is safe with CASCADE.
// schema_migrations is intentionally excluded.
const TABLES = [
  "order_items",
  "orders",
  "supplier_invoice_items",
  "supplier_invoices",
  "expense_records",
  "purchase_order_items",
  "purchase_orders",
  "stock_movements",
  "recipe_ingredients",
  "recipes",
  "menu_items",
  "products",
  "ingredients",
  "restaurant_tables",
  "expense_categories",
  "menu_categories",
  "product_categories",
  "warehouses",
  "suppliers",
  "users",
  "restaurant_profile",
];

// Refuse to wipe a production database unless explicitly allowed, so pointing
// DATABASE_URL at Neon cannot clear it by accident.
function assertResetAllowed() {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && process.env.SEED_ALLOW_PROD !== "true") {
    throw new Error(
      "Refusing to reset a production database. Set SEED_ALLOW_PROD=true to override."
    );
  }
}

async function seed() {
  assertResetAllowed();

  const client = await pool.connect();
  const ctx = { rng: makeRng(), asOf: resolveAsOf() };

  try {
    await client.query("BEGIN");
    await client.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);

    await seedReference(client, ctx);
    await seedUsers(client, ctx);
    await seedCatalog(client, ctx);
    await seedRecipes(client, ctx);
    await seedPurchasing(client, ctx);
    await seedExpenses(client, ctx);
    await seedOrders(client, ctx);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  console.log("Seed complete:");
  console.log(`  users:              ${ctx.users.all.length}`);
  console.log(`  suppliers:          ${ctx.suppliers.length}`);
  console.log(`  ingredients:        ${Object.keys(ctx.ingredients).length}`);
  console.log(`  products:           ${ctx.products.length}`);
  console.log(`  menu items:         ${ctx.menuItems.length}`);
  console.log(`  recipes:            ${ctx.recipeCount} (${ctx.recipeIngredientCount} ingredient lines)`);
  console.log(`  tables:             ${ctx.tables.length}`);
  console.log(`  purchase orders:    ${ctx.poCount}`);
  console.log(`  stock movements:    ${ctx.movementCount}`);
  console.log(`  supplier invoices:  ${ctx.invoiceCount} (${ctx.invoiceItemCount} line items)`);
  console.log(`  expense records:    ${ctx.expenseCount}`);
  console.log(`  orders:             ${ctx.orderCount} (${ctx.orderItemCount} line items)`);
}

if (require.main === module) {
  seed()
    .then(() => pool.end())
    .catch((error) => {
      console.error("Seed failed:", error.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { seed };
