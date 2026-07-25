const { insert } = require("./helpers");

// Recipes for a subset of menu items, each with a few ingredient lines.
// Quantities are per the recipe yield_servings. Units follow each ingredient's
// stocking unit so recipe lines stay consistent with ingredient stock.

// menu item name -> { yield, prep, ingredients: [ [ingredientName, quantity] ] }
const RECIPES = {
  "Paneer Tikka": { yield: 2, prep: 18, items: [["Paneer", 0.25], ["Yogurt", 0.1], ["Red Chilli Powder", 8], ["Garam Masala", 5], ["Onion", 0.1]] },
  "Chicken 65": { yield: 2, prep: 20, items: [["Chicken", 0.3], ["Red Chilli Powder", 10], ["Garlic", 0.02], ["Ginger", 0.02], ["Cooking Oil", 0.05]] },
  "Veg Spring Roll": { yield: 2, prep: 15, items: [["Wheat Flour", 0.12], ["Onion", 0.08], ["Cooking Oil", 0.06]] },
  "Fish Amritsari": { yield: 2, prep: 22, items: [["Red Chilli Powder", 8], ["Wheat Flour", 0.08], ["Cooking Oil", 0.08], ["Garlic", 0.02]] },
  "Onion Bhaji": { yield: 2, prep: 12, items: [["Onion", 0.2], ["Wheat Flour", 0.1], ["Cooking Oil", 0.06]] },
  "Chilli Chicken": { yield: 2, prep: 20, items: [["Chicken", 0.3], ["Green Chilli", 0.03], ["Onion", 0.1], ["Garlic", 0.02]] },
  "Butter Chicken": { yield: 2, prep: 25, items: [["Chicken", 0.3], ["Butter", 0.05], ["Fresh Cream", 0.1], ["Tomato", 0.2], ["Garam Masala", 6]] },
  "Paneer Butter Masala": { yield: 2, prep: 22, items: [["Paneer", 0.25], ["Butter", 0.04], ["Fresh Cream", 0.1], ["Tomato", 0.2]] },
  "Dal Makhani": { yield: 2, prep: 30, items: [["Butter", 0.03], ["Fresh Cream", 0.08], ["Tomato", 0.1], ["Garam Masala", 5]] },
  "Chicken Curry": { yield: 2, prep: 26, items: [["Chicken", 0.3], ["Onion", 0.15], ["Tomato", 0.15], ["Red Chilli Powder", 8]] },
  "Mutton Rogan Josh": { yield: 2, prep: 35, items: [["Mutton", 0.3], ["Onion", 0.15], ["Yogurt", 0.1], ["Garam Masala", 8]] },
  "Palak Paneer": { yield: 2, prep: 22, items: [["Paneer", 0.2], ["Coriander Leaves", 30], ["Onion", 0.1], ["Cumin Seeds", 5]] },
  "Kadai Chicken": { yield: 2, prep: 26, items: [["Chicken", 0.3], ["Tomato", 0.15], ["Green Chilli", 0.02], ["Onion", 0.12]] },
  "Chana Masala": { yield: 2, prep: 20, items: [["Onion", 0.12], ["Tomato", 0.12], ["Garam Masala", 5], ["Cumin Seeds", 5]] },
  "Butter Naan": { yield: 1, prep: 8, items: [["Wheat Flour", 0.12], ["Butter", 0.01], ["Milk", 0.03]] },
  "Chicken Biryani": { yield: 2, prep: 30, items: [["Basmati Rice", 0.25], ["Chicken", 0.25], ["Onion", 0.12], ["Yogurt", 0.08], ["Garam Masala", 7]] },
  "Veg Biryani": { yield: 2, prep: 28, items: [["Basmati Rice", 0.25], ["Potato", 0.1], ["Onion", 0.12], ["Garam Masala", 6]] },
  "Mango Lassi": { yield: 1, prep: 5, items: [["Yogurt", 0.15], ["Sugar", 0.02], ["Milk", 0.05]] },
};

async function seedRecipes(client, ctx) {
  ctx.recipeCount = 0;
  ctx.recipeIngredientCount = 0;

  for (const menuItem of ctx.menuItems) {
    const def = RECIPES[menuItem.name];
    if (!def) continue;

    const { id: recipeId } = await insert(client, "recipes", {
      menu_item_id: menuItem.id,
      yield_servings: def.yield,
      instructions: `Prepare ${menuItem.name} to order following house standard.`,
      prep_time_minutes: def.prep,
    });
    ctx.recipeCount += 1;

    for (const [ingredientName, quantity] of def.items) {
      const ingredient = ctx.ingredients[ingredientName];
      if (!ingredient) continue;
      await insert(client, "recipe_ingredients", {
        recipe_id: recipeId,
        ingredient_id: ingredient.id,
        quantity,
        unit: ingredient.unit,
      });
      ctx.recipeIngredientCount += 1;
    }
  }
}

module.exports = { seedRecipes };
