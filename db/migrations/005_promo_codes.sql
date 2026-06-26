-- Одноразовые тестовые промокоды: обходят оплату, каждый код срабатывает 1 раз.
CREATE TABLE IF NOT EXISTS promo_codes (
  code       text PRIMARY KEY,
  used       boolean NOT NULL DEFAULT false,
  used_at    timestamptz,
  order_id   uuid REFERENCES orders(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
