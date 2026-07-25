-- Front of house catalog: dining tables, menu categories, and menu items.

CREATE TABLE restaurant_tables (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label      text NOT NULL,
  capacity   int NOT NULL,
  section    text,
  status     table_status NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_restaurant_tables_label UNIQUE (label),
  CONSTRAINT chk_restaurant_tables_capacity CHECK (capacity > 0)
);

CREATE INDEX idx_restaurant_tables_status ON restaurant_tables (status);

CREATE TRIGGER trg_restaurant_tables_updated_at
  BEFORE UPDATE ON restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE menu_categories (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  description text,
  sort_order  int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_menu_categories_name UNIQUE (name)
);

CREATE TRIGGER trg_menu_categories_updated_at
  BEFORE UPDATE ON menu_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE menu_items (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id       bigint NOT NULL REFERENCES menu_categories (id) ON DELETE RESTRICT,
  name              text NOT NULL,
  description       text,
  price             numeric(12,2) NOT NULL,
  cost              numeric(12,2),
  prep_time_minutes int,
  is_available      boolean NOT NULL DEFAULT true,
  image_url         text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_menu_items_category_name UNIQUE (category_id, name),
  CONSTRAINT chk_menu_items_price CHECK (price >= 0),
  CONSTRAINT chk_menu_items_prep_time CHECK (prep_time_minutes IS NULL OR prep_time_minutes >= 0)
);

CREATE INDEX idx_menu_items_category_id ON menu_items (category_id);
CREATE INDEX idx_menu_items_is_available ON menu_items (is_available);

CREATE TRIGGER trg_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
