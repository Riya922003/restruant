-- Expense categories, supplier invoices with line items, and expense records.
-- supplier_invoices is created before expense_records so the optional
-- expense_records.invoice_id foreign key can be declared inline.

CREATE TABLE expense_categories (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_expense_categories_name UNIQUE (name)
);

CREATE TRIGGER trg_expense_categories_updated_at
  BEFORE UPDATE ON expense_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE supplier_invoices (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_number text NOT NULL,
  supplier_id    bigint NOT NULL REFERENCES suppliers (id) ON DELETE RESTRICT,
  invoice_date   date,
  due_date       date,
  subtotal       numeric(12,2) NOT NULL DEFAULT 0,
  tax            numeric(12,2) NOT NULL DEFAULT 0,
  total          numeric(12,2) NOT NULL DEFAULT 0,
  status         invoice_status NOT NULL DEFAULT 'pending',
  file_url       text,
  ocr_raw        jsonb,
  notes          text,
  created_by     bigint REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_supplier_invoices_supplier_number UNIQUE (supplier_id, invoice_number)
);

CREATE INDEX idx_supplier_invoices_supplier_id ON supplier_invoices (supplier_id);
CREATE INDEX idx_supplier_invoices_status ON supplier_invoices (status);
CREATE INDEX idx_supplier_invoices_invoice_date ON supplier_invoices (invoice_date);

CREATE TRIGGER trg_supplier_invoices_updated_at
  BEFORE UPDATE ON supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE supplier_invoice_items (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id  bigint NOT NULL REFERENCES supplier_invoices (id) ON DELETE CASCADE,
  product_id  bigint REFERENCES products (id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity    numeric(12,3) NOT NULL,
  unit_price  numeric(12,2) NOT NULL,
  line_total  numeric(12,2) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_supplier_invoice_items_quantity CHECK (quantity > 0)
);

CREATE INDEX idx_supplier_invoice_items_invoice_id ON supplier_invoice_items (invoice_id);

CREATE TRIGGER trg_supplier_invoice_items_updated_at
  BEFORE UPDATE ON supplier_invoice_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE expense_records (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id    bigint NOT NULL REFERENCES expense_categories (id) ON DELETE RESTRICT,
  supplier_id    bigint REFERENCES suppliers (id) ON DELETE SET NULL,
  invoice_id     bigint REFERENCES supplier_invoices (id) ON DELETE SET NULL,
  description    text NOT NULL,
  amount         numeric(12,2) NOT NULL,
  expense_date   date NOT NULL,
  payment_method payment_method,
  reference      text,
  created_by     bigint REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_expense_records_amount CHECK (amount >= 0)
);

CREATE INDEX idx_expense_records_category_id ON expense_records (category_id);
CREATE INDEX idx_expense_records_expense_date ON expense_records (expense_date);
CREATE INDEX idx_expense_records_supplier_id ON expense_records (supplier_id);

CREATE TRIGGER trg_expense_records_updated_at
  BEFORE UPDATE ON expense_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
