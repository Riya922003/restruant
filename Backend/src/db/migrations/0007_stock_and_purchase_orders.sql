-- Stock movement ledger and purchase orders. Quantity is always positive;
-- direction is derived from movement_type and applied to products.current_stock
-- by the service inside a transaction.

CREATE TABLE stock_movements (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id    bigint NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  warehouse_id  bigint NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  movement_type stock_movement_type NOT NULL,
  quantity      numeric(12,3) NOT NULL,
  unit_cost     numeric(12,2),
  reference     text,
  reason        text,
  created_by    bigint REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_stock_movements_quantity CHECK (quantity > 0)
);

CREATE INDEX idx_stock_movements_product_id ON stock_movements (product_id);
CREATE INDEX idx_stock_movements_created_at ON stock_movements (created_at);

CREATE TRIGGER trg_stock_movements_updated_at
  BEFORE UPDATE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE purchase_orders (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_number     text NOT NULL,
  supplier_id   bigint NOT NULL REFERENCES suppliers (id) ON DELETE RESTRICT,
  warehouse_id  bigint NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  status        purchase_order_status NOT NULL DEFAULT 'draft',
  order_date    date,
  expected_date date,
  received_date date,
  subtotal      numeric(12,2) NOT NULL DEFAULT 0,
  tax           numeric(12,2) NOT NULL DEFAULT 0,
  total         numeric(12,2) NOT NULL DEFAULT 0,
  notes         text,
  created_by    bigint REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_purchase_orders_po_number UNIQUE (po_number)
);

CREATE INDEX idx_purchase_orders_supplier_id ON purchase_orders (supplier_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders (status);

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE purchase_order_items (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purchase_order_id bigint NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
  product_id        bigint NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  quantity_ordered  numeric(12,3) NOT NULL,
  quantity_received numeric(12,3) NOT NULL DEFAULT 0,
  unit_cost         numeric(12,2) NOT NULL,
  line_total        numeric(12,2) NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_po_items_quantity_ordered CHECK (quantity_ordered > 0),
  CONSTRAINT chk_po_items_quantity_received CHECK (quantity_received >= 0)
);

CREATE INDEX idx_purchase_order_items_po_id ON purchase_order_items (purchase_order_id);

CREATE TRIGGER trg_purchase_order_items_updated_at
  BEFORE UPDATE ON purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
