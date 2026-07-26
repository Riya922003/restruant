-- Phase 2: AI invoice processing staging + audit logs.
-- Raw uploads land in invoice_imports (staging) so OCR noise never violates the
-- Phase 1 supplier_invoices constraints (supplier_id NOT NULL, unique invoice
-- number). Real supplier_invoices rows are created only on user approval.

CREATE TYPE invoice_import_status AS ENUM
  ('uploaded', 'queued', 'processing', 'extracted', 'failed', 'approved', 'rejected');

CREATE TABLE invoice_import_batches (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uploaded_by bigint REFERENCES users (id) ON DELETE SET NULL,
  file_count  int NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'processing', -- processing | complete | partial
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_invoice_import_batches_updated_at
  BEFORE UPDATE ON invoice_import_batches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invoice_imports (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id              bigint REFERENCES invoice_import_batches (id) ON DELETE CASCADE,
  uploaded_by           bigint REFERENCES users (id) ON DELETE SET NULL,
  original_filename     text NOT NULL,
  mime_type             text NOT NULL,
  file_size             bigint,
  cloudinary_public_id  text,
  file_url              text,
  status                invoice_import_status NOT NULL DEFAULT 'uploaded',
  extracted_data        jsonb,
  extraction_confidence numeric(5,2),
  error_message         text,
  matched_supplier_id   bigint REFERENCES suppliers (id) ON DELETE SET NULL,
  created_invoice_id    bigint REFERENCES supplier_invoices (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_imports_batch_id ON invoice_imports (batch_id);
CREATE INDEX idx_invoice_imports_status ON invoice_imports (status);
CREATE INDEX idx_invoice_imports_uploaded_by ON invoice_imports (uploaded_by);

CREATE TRIGGER trg_invoice_imports_updated_at
  BEFORE UPDATE ON invoice_imports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE audit_logs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id bigint REFERENCES users (id) ON DELETE SET NULL,
  action        text NOT NULL,
  entity_type   text,
  entity_id     bigint,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_action ON audit_logs (action);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);
