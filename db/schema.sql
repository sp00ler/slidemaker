-- SlideMaker — схема БД (одна таблица)
-- Запуск: psql "$DATABASE_URL" -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- даёт gen_random_uuid()

CREATE TABLE IF NOT EXISTS orders (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL,
  tariff      text        NOT NULL,                 -- 'basic' | 'standard'
  slide_count int         NOT NULL,
  topic       text        NOT NULL,
  wishes      text,
  storyboard  text,
  style       text        NOT NULL,                 -- 'business' | 'creative' | 'minimal'
  status      text        NOT NULL DEFAULT 'pending', -- pending | generating | done | error
  file_path   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);

CREATE TABLE IF NOT EXISTS order_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_token uuid NOT NULL,
  order_id     uuid REFERENCES orders(id),
  slide_number int  NOT NULL,
  stored_path  text NOT NULL,
  mime         text NOT NULL,
  size         int  NOT NULL,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_files_token_idx ON order_files (upload_token);
CREATE INDEX IF NOT EXISTS order_files_order_idx ON order_files (order_id);
