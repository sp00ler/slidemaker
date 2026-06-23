-- История 1: исходная работа (.docx) хранится строкой в order_files c kind='source'
-- (slide_number = 0). Картинки по слайдам остаются kind='slide'.
ALTER TABLE order_files ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'slide';

CREATE INDEX IF NOT EXISTS order_files_kind_idx ON order_files (order_id, kind);
