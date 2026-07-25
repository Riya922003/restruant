const { insert, round3 } = require("./helpers");

// Kitchen ingredients, inventory products, and menu items.
// Ingredient stock is set directly (no ledger in Phase 1). Product stock starts
// at 0 here and is derived from the stock_movements ledger in the purchasing
// seed, so product balances always reconcile with their movements.

// current_stock below reorder_level marks a low-stock ingredient for the
// dashboard widget.
const INGREDIENTS = [
  { name: "Basmati Rice", unit: "kg", current_stock: 60, reorder_level: 20, cost_per_unit: 95, s: 0 },
  { name: "Wheat Flour", unit: "kg", current_stock: 45, reorder_level: 15, cost_per_unit: 40, s: 0 },
  { name: "Paneer", unit: "kg", current_stock: 8, reorder_level: 10, cost_per_unit: 320, s: 2 },
  { name: "Chicken", unit: "kg", current_stock: 18, reorder_level: 12, cost_per_unit: 240, s: 1 },
  { name: "Mutton", unit: "kg", current_stock: 6, reorder_level: 8, cost_per_unit: 620, s: 1 },
  { name: "Onion", unit: "kg", current_stock: 55, reorder_level: 25, cost_per_unit: 35, s: 0 },
  { name: "Tomato", unit: "kg", current_stock: 30, reorder_level: 20, cost_per_unit: 45, s: 0 },
  { name: "Potato", unit: "kg", current_stock: 40, reorder_level: 15, cost_per_unit: 30, s: 0 },
  { name: "Garlic", unit: "kg", current_stock: 9, reorder_level: 5, cost_per_unit: 160, s: 0 },
  { name: "Ginger", unit: "kg", current_stock: 4, reorder_level: 5, cost_per_unit: 140, s: 0 },
  { name: "Green Chilli", unit: "kg", current_stock: 6, reorder_level: 3, cost_per_unit: 80, s: 0 },
  { name: "Butter", unit: "kg", current_stock: 12, reorder_level: 8, cost_per_unit: 480, s: 2 },
  { name: "Fresh Cream", unit: "l", current_stock: 7, reorder_level: 10, cost_per_unit: 220, s: 2 },
  { name: "Milk", unit: "l", current_stock: 35, reorder_level: 20, cost_per_unit: 60, s: 2 },
  { name: "Yogurt", unit: "kg", current_stock: 14, reorder_level: 10, cost_per_unit: 90, s: 2 },
  { name: "Cooking Oil", unit: "l", current_stock: 28, reorder_level: 15, cost_per_unit: 130, s: 0 },
  { name: "Salt", unit: "kg", current_stock: 20, reorder_level: 5, cost_per_unit: 20, s: 0 },
  { name: "Sugar", unit: "kg", current_stock: 18, reorder_level: 8, cost_per_unit: 45, s: 0 },
  { name: "Garam Masala", unit: "g", current_stock: 1800, reorder_level: 500, cost_per_unit: 1.2, s: 0 },
  { name: "Turmeric Powder", unit: "g", current_stock: 400, reorder_level: 500, cost_per_unit: 0.6, s: 0 },
  { name: "Red Chilli Powder", unit: "g", current_stock: 2200, reorder_level: 600, cost_per_unit: 0.8, s: 0 },
  { name: "Cumin Seeds", unit: "g", current_stock: 1500, reorder_level: 400, cost_per_unit: 1.1, s: 0 },
  { name: "Coriander Leaves", unit: "g", current_stock: 900, reorder_level: 300, cost_per_unit: 0.4, s: 0 },
  { name: "Eggs", unit: "dozen", current_stock: 15, reorder_level: 10, cost_per_unit: 84, s: 1 },
];

// low flag: purchasing seed keeps net stock under reorder_level for these.
const PRODUCTS = [
  { name: "Cola Can 300ml", cat: "Beverages", unit: "pack", reorder_level: 20, cost_price: 240, s: 3, w: 0, low: false },
  { name: "Mineral Water 1L", cat: "Beverages", unit: "box", reorder_level: 15, cost_price: 180, s: 3, w: 0, low: false },
  { name: "Mango Juice 1L", cat: "Beverages", unit: "box", reorder_level: 10, cost_price: 600, s: 3, w: 0, low: true },
  { name: "Orange Juice 1L", cat: "Beverages", unit: "box", reorder_level: 10, cost_price: 620, s: 3, w: 0, low: false },
  { name: "Soda Water", cat: "Beverages", unit: "pack", reorder_level: 12, cost_price: 200, s: 3, w: 0, low: false },
  { name: "Coffee Beans 1kg", cat: "Dry Goods", unit: "pack", reorder_level: 8, cost_price: 850, s: 0, w: 1, low: false },
  { name: "Tea Bags Box", cat: "Dry Goods", unit: "box", reorder_level: 10, cost_price: 300, s: 0, w: 1, low: true },
  { name: "Sugar Sachets", cat: "Dry Goods", unit: "box", reorder_level: 12, cost_price: 260, s: 0, w: 1, low: false },
  { name: "Milk Powder 1kg", cat: "Dairy", unit: "pack", reorder_level: 8, cost_price: 420, s: 2, w: 2, low: false },
  { name: "Cheese Slices", cat: "Dairy", unit: "pack", reorder_level: 10, cost_price: 260, s: 2, w: 2, low: true },
  { name: "Takeaway Box Large", cat: "Packaging", unit: "pack", reorder_level: 25, cost_price: 320, s: 4, w: 0, low: false },
  { name: "Takeaway Box Small", cat: "Packaging", unit: "pack", reorder_level: 25, cost_price: 240, s: 4, w: 0, low: false },
  { name: "Paper Cups 250ml", cat: "Packaging", unit: "pack", reorder_level: 20, cost_price: 180, s: 4, w: 0, low: true },
  { name: "Table Napkins", cat: "Packaging", unit: "pack", reorder_level: 30, cost_price: 120, s: 4, w: 0, low: false },
  { name: "Aluminium Foil Roll", cat: "Packaging", unit: "unit", reorder_level: 15, cost_price: 150, s: 4, w: 1, low: false },
  { name: "Cling Film Roll", cat: "Packaging", unit: "unit", reorder_level: 15, cost_price: 140, s: 4, w: 1, low: false },
  { name: "Paper Straws", cat: "Packaging", unit: "pack", reorder_level: 20, cost_price: 90, s: 4, w: 0, low: false },
  { name: "Dishwash Liquid 5L", cat: "Cleaning", unit: "unit", reorder_level: 8, cost_price: 480, s: 5, w: 0, low: false },
  { name: "Floor Cleaner 5L", cat: "Cleaning", unit: "unit", reorder_level: 6, cost_price: 520, s: 5, w: 0, low: true },
  { name: "Hand Sanitizer 1L", cat: "Cleaning", unit: "unit", reorder_level: 10, cost_price: 220, s: 5, w: 0, low: false },
  { name: "Trash Bags Large", cat: "Cleaning", unit: "pack", reorder_level: 15, cost_price: 160, s: 5, w: 0, low: false },
  { name: "Ketchup Sachets", cat: "Dry Goods", unit: "box", reorder_level: 12, cost_price: 340, s: 0, w: 1, low: false },
  { name: "Mustard Sachets", cat: "Dry Goods", unit: "box", reorder_level: 12, cost_price: 300, s: 0, w: 1, low: false },
  { name: "Bottled Soft Drink 500ml", cat: "Beverages", unit: "pack", reorder_level: 18, cost_price: 360, s: 3, w: 0, low: false },
];

const MENU_ITEMS = [
  { name: "Paneer Tikka", cat: "Starters", price: 280, cost: 105, prep: 18 },
  { name: "Chicken 65", cat: "Starters", price: 320, cost: 120, prep: 20 },
  { name: "Veg Spring Roll", cat: "Starters", price: 220, cost: 70, prep: 15 },
  { name: "Fish Amritsari", cat: "Starters", price: 360, cost: 150, prep: 22 },
  { name: "Onion Bhaji", cat: "Starters", price: 180, cost: 55, prep: 12 },
  { name: "Chilli Chicken", cat: "Starters", price: 330, cost: 125, prep: 20 },
  { name: "Butter Chicken", cat: "Mains", price: 420, cost: 165, prep: 25 },
  { name: "Paneer Butter Masala", cat: "Mains", price: 360, cost: 130, prep: 22 },
  { name: "Dal Makhani", cat: "Mains", price: 280, cost: 85, prep: 30 },
  { name: "Chicken Curry", cat: "Mains", price: 380, cost: 150, prep: 26 },
  { name: "Mutton Rogan Josh", cat: "Mains", price: 520, cost: 240, prep: 35 },
  { name: "Palak Paneer", cat: "Mains", price: 340, cost: 120, prep: 22 },
  { name: "Kadai Chicken", cat: "Mains", price: 400, cost: 160, prep: 26 },
  { name: "Chana Masala", cat: "Mains", price: 260, cost: 80, prep: 20 },
  { name: "Butter Naan", cat: "Breads", price: 60, cost: 18, prep: 8 },
  { name: "Garlic Naan", cat: "Breads", price: 80, cost: 24, prep: 9 },
  { name: "Tandoori Roti", cat: "Breads", price: 40, cost: 12, prep: 7 },
  { name: "Laccha Paratha", cat: "Breads", price: 70, cost: 22, prep: 10 },
  { name: "Chicken Biryani", cat: "Rice & Biryani", price: 380, cost: 150, prep: 30 },
  { name: "Veg Biryani", cat: "Rice & Biryani", price: 300, cost: 100, prep: 28 },
  { name: "Jeera Rice", cat: "Rice & Biryani", price: 180, cost: 55, prep: 15 },
  { name: "Steamed Rice", cat: "Rice & Biryani", price: 140, cost: 40, prep: 12 },
  { name: "Gulab Jamun", cat: "Desserts", price: 140, cost: 45, prep: 6 },
  { name: "Gajar Halwa", cat: "Desserts", price: 160, cost: 55, prep: 8 },
  { name: "Kulfi", cat: "Desserts", price: 130, cost: 40, prep: 5 },
  { name: "Masala Chai", cat: "Beverages", price: 60, cost: 15, prep: 6 },
  { name: "Sweet Lassi", cat: "Beverages", price: 110, cost: 35, prep: 5 },
  { name: "Mango Lassi", cat: "Beverages", price: 130, cost: 45, prep: 5 },
  { name: "Fresh Lime Soda", cat: "Beverages", price: 90, cost: 25, prep: 4 },
  { name: "Cold Coffee", cat: "Beverages", price: 150, cost: 50, prep: 7 },
];

async function seedCatalog(client, ctx) {
  ctx.ingredients = {};
  for (const ing of INGREDIENTS) {
    const { id } = await insert(client, "ingredients", {
      name: ing.name,
      unit: ing.unit,
      current_stock: round3(ing.current_stock),
      reorder_level: round3(ing.reorder_level),
      cost_per_unit: ing.cost_per_unit,
      supplier_id: ctx.suppliers[ing.s],
      is_active: true,
    });
    ctx.ingredients[ing.name] = { id, unit: ing.unit };
  }

  ctx.products = [];
  let sku = 1;
  for (const p of PRODUCTS) {
    const { id } = await insert(client, "products", {
      sku: `PRD-${String(sku).padStart(4, "0")}`,
      name: p.name,
      category_id: ctx.productCategories[p.cat],
      unit: p.unit,
      current_stock: 0,
      reorder_level: round3(p.reorder_level),
      cost_price: p.cost_price,
      supplier_id: ctx.suppliers[p.s],
      warehouse_id: ctx.warehouses[p.w],
      is_active: true,
    });
    ctx.products.push({
      id,
      warehouse_id: ctx.warehouses[p.w],
      reorder_level: p.reorder_level,
      cost_price: p.cost_price,
      low: p.low,
    });
    sku += 1;
  }

  ctx.menuItems = [];
  for (const m of MENU_ITEMS) {
    const { id } = await insert(client, "menu_items", {
      category_id: ctx.menuCategories[m.cat],
      name: m.name,
      description: null,
      price: m.price,
      cost: m.cost,
      prep_time_minutes: m.prep,
      is_available: true,
    });
    ctx.menuItems.push({ id, name: m.name, price: m.price, cost: m.cost });
  }
}

module.exports = { seedCatalog };
