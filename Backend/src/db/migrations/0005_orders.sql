-- Orders and their line items. Totals are recomputed server-side from
-- order_items; item_name and unit_price are snapshotted at order time.

CREATE TABLE orders (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_number   text NOT NULL,
  table_id       bigint REFERENCES restaurant_tables (id) ON DELETE SET NULL,
  order_type     order_type NOT NULL DEFAULT 'dine_in',
  status         order_status NOT NULL DEFAULT 'open',
  waiter_id      bigint REFERENCES users (id) ON DELETE SET NULL,
  subtotal       numeric(12,2) NOT NULL DEFAULT 0,
  tax            numeric(12,2) NOT NULL DEFAULT 0,
  discount       numeric(12,2) NOT NULL DEFAULT 0,
  total          numeric(12,2) NOT NULL DEFAULT 0,
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  payment_method payment_method,
  notes          text,
  placed_at      timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_orders_order_number UNIQUE (order_number)
);

CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_table_id ON orders (table_id);
CREATE INDEX idx_orders_created_at ON orders (created_at);
CREATE INDEX idx_orders_payment_status ON orders (payment_status);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE order_items (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id     bigint NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  menu_item_id bigint NOT NULL REFERENCES menu_items (id) ON DELETE RESTRICT,
  item_name    text NOT NULL,
  quantity     int NOT NULL,
  unit_price   numeric(12,2) NOT NULL,
  line_total   numeric(12,2) NOT NULL,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_order_items_quantity CHECK (quantity > 0)
);

CREATE INDEX idx_order_items_order_id ON order_items (order_id);

CREATE TRIGGER trg_order_items_updated_at
  BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
