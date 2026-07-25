-- Kitchen ingredients, recipes, and the recipe/ingredient join.
-- ingredients.supplier_id references suppliers, which is created later in 0006;
-- the foreign key constraint is added there once suppliers exists.

CREATE TABLE ingredients (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL,
  unit          measurement_unit NOT NULL,
  current_stock numeric(12,3) NOT NULL DEFAULT 0,
  reorder_level numeric(12,3) NOT NULL DEFAULT 0,
  cost_per_unit numeric(12,2) NOT NULL DEFAULT 0,
  supplier_id   bigint,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ingredients_name UNIQUE (name),
  CONSTRAINT chk_ingredients_current_stock CHECK (current_stock >= 0)
);

CREATE INDEX idx_ingredients_supplier_id ON ingredients (supplier_id);

CREATE TRIGGER trg_ingredients_updated_at
  BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE recipes (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  menu_item_id      bigint NOT NULL REFERENCES menu_items (id) ON DELETE CASCADE,
  yield_servings    int NOT NULL DEFAULT 1,
  instructions      text,
  prep_time_minutes int,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_recipes_menu_item_id UNIQUE (menu_item_id),
  CONSTRAINT chk_recipes_yield_servings CHECK (yield_servings > 0)
);

CREATE TRIGGER trg_recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE recipe_ingredients (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipe_id     bigint NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  ingredient_id bigint NOT NULL REFERENCES ingredients (id) ON DELETE RESTRICT,
  quantity      numeric(12,3) NOT NULL,
  unit          measurement_unit NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_recipe_ingredients_recipe_ingredient UNIQUE (recipe_id, ingredient_id),
  CONSTRAINT chk_recipe_ingredients_quantity CHECK (quantity > 0)
);

CREATE INDEX idx_recipe_ingredients_recipe_id ON recipe_ingredients (recipe_id);
CREATE INDEX idx_recipe_ingredients_ingredient_id ON recipe_ingredients (ingredient_id);

CREATE TRIGGER trg_recipe_ingredients_updated_at
  BEFORE UPDATE ON recipe_ingredients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
