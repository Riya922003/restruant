const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { withTransaction } = require("../../utils/with-transaction");
const { toNum } = require("../../utils/serialize");
const { writeAudit, writeAuditTx } = require("../audit/audit.service");

const SORT_WHITELIST = ["created_at", "yield_servings"];

function mapRecipe(row) {
  return {
    id: toNum(row.id),
    menu_item_id: toNum(row.menu_item_id),
    menu_item_name: row.menu_item_name,
    yield_servings: toNum(row.yield_servings),
    instructions: row.instructions,
    prep_time_minutes: toNum(row.prep_time_minutes),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapLine(row) {
  return {
    id: toNum(row.id),
    ingredient_id: toNum(row.ingredient_id),
    ingredient_name: row.ingredient_name,
    quantity: toNum(row.quantity),
    unit: row.unit,
  };
}

async function loadLines(client, recipeId) {
  const { rows } = await client.query(
    `SELECT ri.*, i.name AS ingredient_name
     FROM recipe_ingredients ri
     JOIN ingredients i ON i.id = ri.ingredient_id
     WHERE ri.recipe_id = $1
     ORDER BY ri.id ASC`,
    [recipeId]
  );
  return rows.map(mapLine);
}

async function fetchRecipe(runner, id) {
  const { rows } = await runner.query(
    `SELECT r.*, mi.name AS menu_item_name
     FROM recipes r
     JOIN menu_items mi ON mi.id = r.menu_item_id
     WHERE r.id = $1`,
    [id]
  );
  return rows[0];
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "created_at DESC").replace(/^/, "r.");

  const where = [];
  const params = [];
  if (query.menu_item_id) {
    params.push(query.menu_item_id);
    where.push(`r.menu_item_id = $${params.length}`);
  }
  if (query.ingredient_id) {
    params.push(query.ingredient_id);
    where.push(`EXISTS (SELECT 1 FROM recipe_ingredients ri WHERE ri.recipe_id = r.id AND ri.ingredient_id = $${params.length})`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`mi.name ILIKE $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM recipes r JOIN menu_items mi ON mi.id = r.menu_item_id ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT r.*, mi.name AS menu_item_name
     FROM recipes r JOIN menu_items mi ON mi.id = r.menu_item_id
     ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapRecipe), meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const row = await fetchRecipe(pool, id);
  if (!row) throw new ApiError(404, "Recipe not found");
  const recipe = mapRecipe(row);
  recipe.ingredients = await loadLines(pool, id);
  return recipe;
}

async function getByMenuItem(menuItemId) {
  const { rows } = await pool.query(
    `SELECT r.*, mi.name AS menu_item_name
     FROM recipes r JOIN menu_items mi ON mi.id = r.menu_item_id
     WHERE r.menu_item_id = $1`,
    [menuItemId]
  );
  if (!rows[0]) throw new ApiError(404, "Recipe not found for this menu item");
  const recipe = mapRecipe(rows[0]);
  recipe.ingredients = await loadLines(pool, recipe.id);
  return recipe;
}

async function insertLine(client, recipeId, line) {
  await client.query(
    `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit)
     VALUES ($1, $2, $3, $4)`,
    [recipeId, line.ingredient_id, line.quantity, line.unit]
  );
}

async function create(body, user) {
  return withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO recipes (menu_item_id, yield_servings, instructions, prep_time_minutes)
       VALUES ($1, COALESCE($2, 1), $3, $4) RETURNING id`,
      [body.menu_item_id, body.yield_servings ?? null, body.instructions ?? null, body.prep_time_minutes ?? null]
    );
    const recipeId = inserted.rows[0].id;

    for (const line of body.ingredients ?? []) {
      await insertLine(client, recipeId, line);
    }

    const row = await fetchRecipe(client, recipeId);
    const recipe = mapRecipe(row);
    recipe.ingredients = await loadLines(client, recipeId);

    await writeAuditTx(client, {
      actorUserId: user?.id,
      action: "recipe.created",
      entityType: "recipe",
      entityId: recipe.id,
      metadata: { name: recipe.menu_item_name },
    });
    return recipe;
  });
}

async function update(id, body, user) {
  const sets = [];
  const params = [];
  for (const key of ["yield_servings", "instructions", "prep_time_minutes"]) {
    if (body[key] !== undefined) {
      params.push(body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) throw new ApiError(422, "At least one field is required");

  params.push(id);
  const updated = await pool.query(
    `UPDATE recipes SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id`,
    params
  );
  if (!updated.rows[0]) throw new ApiError(404, "Recipe not found");
  await writeAudit({
    actorUserId: user?.id,
    action: "recipe.updated",
    entityType: "recipe",
    entityId: toNum(updated.rows[0].id),
    metadata: { changed: Object.keys(body) },
  });
  return getById(id);
}

async function ensureRecipeExists(runner, id) {
  const { rows } = await runner.query("SELECT id FROM recipes WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Recipe not found");
}

async function replaceIngredients(id, ingredients) {
  await withTransaction(async (client) => {
    await ensureRecipeExists(client, id);
    await client.query("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [id]);
    for (const line of ingredients) {
      await insertLine(client, id, line);
    }
  });
  return getById(id);
}

async function addIngredient(id, line) {
  await ensureRecipeExists(pool, id);
  await insertLine(pool, id, line);
  return getById(id);
}

async function updateIngredient(id, lineId, body) {
  const sets = [];
  const params = [];
  for (const key of ["quantity", "unit"]) {
    if (body[key] !== undefined) {
      params.push(body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) throw new ApiError(422, "At least one field is required");

  params.push(lineId, id);
  const updated = await pool.query(
    `UPDATE recipe_ingredients SET ${sets.join(", ")}
     WHERE id = $${params.length - 1} AND recipe_id = $${params.length} RETURNING id`,
    params
  );
  if (!updated.rows[0]) throw new ApiError(404, "Recipe ingredient not found");
  return getById(id);
}

async function removeIngredient(id, lineId) {
  const deleted = await pool.query(
    "DELETE FROM recipe_ingredients WHERE id = $1 AND recipe_id = $2 RETURNING id",
    [lineId, id]
  );
  if (!deleted.rows[0]) throw new ApiError(404, "Recipe ingredient not found");
  return { success: true };
}

async function remove(id, user) {
  const deleted = await pool.query("DELETE FROM recipes WHERE id = $1 RETURNING id", [id]);
  if (!deleted.rows[0]) throw new ApiError(404, "Recipe not found");
  await writeAudit({
    actorUserId: user?.id,
    action: "recipe.deleted",
    entityType: "recipe",
    entityId: toNum(deleted.rows[0].id),
    metadata: null,
  });
  return { success: true };
}

module.exports = {
  list,
  getById,
  getByMenuItem,
  create,
  update,
  replaceIngredients,
  addIngredient,
  updateIngredient,
  removeIngredient,
  remove,
};
