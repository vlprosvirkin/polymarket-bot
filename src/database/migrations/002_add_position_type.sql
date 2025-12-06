-- Migration: 002_add_position_type
-- Description: Добавление поля position_type для явного указания типа позиции (LONG/SHORT)
-- Date: 2025-12-06

-- =====================================================
-- Добавление поля position_type
-- =====================================================

-- Добавить поле position_type
ALTER TABLE positions 
ADD COLUMN IF NOT EXISTS position_type VARCHAR(5) CHECK (position_type IN ('LONG', 'SHORT'));

-- Обновить существующие записи на основе side
UPDATE positions 
SET position_type = CASE 
    WHEN side = 'BUY' THEN 'LONG'
    WHEN side = 'SELL' THEN 'SHORT'
    ELSE 'LONG'  -- Fallback для безопасности
END
WHERE position_type IS NULL;

-- Сделать поле NOT NULL после обновления всех записей
ALTER TABLE positions 
ALTER COLUMN position_type SET NOT NULL;

-- Добавить индекс для быстрого поиска по типу позиции
CREATE INDEX IF NOT EXISTS idx_positions_position_type ON positions (position_type);

-- Добавить составной индекс для частых запросов
CREATE INDEX IF NOT EXISTS idx_positions_type_status ON positions (position_type, status) 
WHERE status = 'open';

-- Record this migration
INSERT INTO migrations (name) VALUES ('002_add_position_type') ON CONFLICT (name) DO NOTHING;

