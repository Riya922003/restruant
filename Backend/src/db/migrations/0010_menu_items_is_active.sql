-- menu_items is a soft-delete entity (spec 01 section 1.4) but its column list
-- omitted is_active. Add it so DELETE can deactivate rather than hard-delete.

ALTER TABLE menu_items
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

CREATE INDEX idx_menu_items_is_active ON menu_items (is_active);
