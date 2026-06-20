ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS wishes text,
  ADD COLUMN IF NOT EXISTS storyboard text;
