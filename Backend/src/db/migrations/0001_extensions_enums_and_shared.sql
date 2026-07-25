-- Extensions, enum types, and the shared updated_at trigger function.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role AS ENUM
  ('owner', 'manager', 'chef', 'waiter', 'cashier', 'store_manager');

CREATE TYPE table_status AS ENUM
  ('available', 'occupied', 'reserved', 'out_of_service');

CREATE TYPE order_type AS ENUM
  ('dine_in', 'takeaway', 'delivery');

CREATE TYPE order_status AS ENUM
  ('open', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'completed', 'cancelled');

CREATE TYPE payment_status AS ENUM
  ('unpaid', 'paid', 'refunded');

CREATE TYPE payment_method AS ENUM
  ('cash', 'card', 'upi', 'bank_transfer', 'other');

CREATE TYPE stock_movement_type AS ENUM
  ('stock_in', 'stock_out', 'adjustment', 'wastage', 'transfer');

CREATE TYPE purchase_order_status AS ENUM
  ('draft', 'ordered', 'partially_received', 'received', 'cancelled');

CREATE TYPE invoice_status AS ENUM
  ('pending', 'verified', 'paid', 'disputed');

CREATE TYPE measurement_unit AS ENUM
  ('kg', 'g', 'l', 'ml', 'unit', 'pack', 'dozen', 'box');

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
