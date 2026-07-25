-- Suppliers, product categories, warehouses, and inventory products.
-- Also attaches the deferred ingredients.supplier_id foreign key now that
-- suppliers exists.

CREATE TABLE suppliers (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL,
  contact_name  text,
  email         text,
  phone         text,
  address       text,
  payment_terms text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_suppliers_name UNIQUE (name)
);

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE ingredients
  ADD CONSTRAINT fk_ingredients_supplier
  FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL;

CREATE TABLE product_categories (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_categories_name UNIQUE (name)
);

CREATE TRIGGER trg_product_categories_updated_at
  BEFORE UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE warehouses (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL,
  location   text,
  type       text NOT NULL DEFAULT 'store',
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_warehouses_name UNIQUE (name)
);

CREATE TRIGGER trg_warehouses_updated_at
  BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE products (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku           text NOT NULL,
  name          text NOT NULL,
  category_id   bigint REFERENCES product_categories (id) ON DELETE SET NULL,
  unit          measurement_unit NOT NULL,
  current_stock numeric(12,3) NOT NULL DEFAULT 0,
  reorder_level numeric(12,3) NOT NULL DEFAULT 0,
  cost_price    numeric(12,2) NOT NULL DEFAULT 0,
  supplier_id   bigint REFERENCES suppliers (id) ON DELETE SET NULL,
  warehouse_id  bigint REFERENCES warehouses (id) ON DELETE SET NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_products_sku UNIQUE (sku),
  CONSTRAINT chk_products_current_stock CHECK (current_stock >= 0)
);

CREATE INDEX idx_products_category_id ON products (category_id);
CREATE INDEX idx_products_supplier_id ON products (supplier_id);
CREATE INDEX idx_products_warehouse_id ON products (warehouse_id);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
