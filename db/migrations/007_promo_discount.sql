ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS discount_percent int NOT NULL DEFAULT 100
  CHECK (discount_percent BETWEEN 1 AND 100);