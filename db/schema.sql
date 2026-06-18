-- SlideMaker — схема БД (одна таблица)
-- Запуск: psql "$DATABASE_URL" -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- даёт gen_random_uuid()

CREATE TABLE IF NOT EXISTS orders (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL,
  tariff      text        NOT NULL,                 -- 'basic' | 'standard'
  slide_count int         NOT NULL,
  topic       text        NOT NULL,
  style       text        NOT NULL,                 -- 'business' | 'creative' | 'minimal'
  status      text        NOT NULL DEFAULT 'pending', -- pending | generating | done | error
  file_path   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
