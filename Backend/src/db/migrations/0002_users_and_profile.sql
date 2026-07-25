-- Users (also the staff directory) and the single-row restaurant profile.

CREATE TABLE users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name     text NOT NULL,
  email         citext NOT NULL,
  password_hash text NOT NULL,
  role          user_role NOT NULL,
  phone         text,
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE INDEX idx_users_role ON users (role);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE restaurant_profile (
  -- Single-row config table. id defaults to 1 and is pinned by the CHECK, so a
  -- second insert collides on the primary key. Not an identity column, so a
  -- failed insert cannot advance a sequence and orphan id = 1.
  id            int PRIMARY KEY DEFAULT 1,
  name          text NOT NULL,
  address       text,
  phone         text,
  email         text,
  currency_code text NOT NULL DEFAULT 'INR',
  tax_rate      numeric(5,2) NOT NULL DEFAULT 0,
  timezone      text NOT NULL DEFAULT 'Asia/Kolkata',
  logo_url      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_profile_singleton CHECK (id = 1)
);

CREATE TRIGGER trg_restaurant_profile_updated_at
  BEFORE UPDATE ON restaurant_profile
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
