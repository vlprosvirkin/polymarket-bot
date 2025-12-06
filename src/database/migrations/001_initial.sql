-- Migration: 001_initial
-- Description: Universal database schema for Polymarket Bot
-- Covers: Trading bot, Copy trading, AI analysis, Market data

-- =====================================================
-- MARKETS: Кэш данных о рынках Polymarket
-- =====================================================
CREATE TABLE IF NOT EXISTS markets (
    id SERIAL PRIMARY KEY,
    condition_id VARCHAR(255) NOT NULL UNIQUE,
    question TEXT NOT NULL,
    description TEXT,
    market_slug VARCHAR(255) NOT NULL,

    -- Статусы
    active BOOLEAN NOT NULL DEFAULT TRUE,
    closed BOOLEAN NOT NULL DEFAULT FALSE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    accepting_orders BOOLEAN NOT NULL DEFAULT TRUE,

    -- Торговые параметры
    minimum_order_size DECIMAL(18, 6) NOT NULL DEFAULT 0,
    minimum_tick_size DECIMAL(10, 6) NOT NULL DEFAULT 0.01,
    neg_risk BOOLEAN NOT NULL DEFAULT FALSE,

    -- Финансовые данные (обновляются периодически)
    volume DECIMAL(18, 2),
    volume_24hr DECIMAL(18, 2),
    liquidity DECIMAL(18, 2),

    -- Токены (JSON для гибкости)
    tokens JSONB NOT NULL DEFAULT '[]',

    -- Метаданные
    category VARCHAR(100),
    tags TEXT[],
    end_date TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_markets_condition_id ON markets (condition_id);
CREATE INDEX IF NOT EXISTS idx_markets_slug ON markets (market_slug);
CREATE INDEX IF NOT EXISTS idx_markets_active ON markets (active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_markets_category ON markets (category);

-- =====================================================
-- WALLETS: Отслеживаемые кошельки (copy trading)
-- =====================================================
CREATE TABLE IF NOT EXISTS wallets (
    id SERIAL PRIMARY KEY,
    address VARCHAR(42) NOT NULL UNIQUE,
    name VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),

    -- Статистика (обновляется автоматически)
    total_trades INTEGER NOT NULL DEFAULT 0,
    winning_trades INTEGER NOT NULL DEFAULT 0,
    total_pnl DECIMAL(18, 6) NOT NULL DEFAULT 0,
    roi DECIMAL(10, 4) NOT NULL DEFAULT 0,
    avg_trade_size DECIMAL(18, 6) NOT NULL DEFAULT 0,
    win_rate DECIMAL(5, 4) NOT NULL DEFAULT 0,

    -- Tracking
    added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_checked_at TIMESTAMP WITH TIME ZONE,
    last_trade_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets (LOWER(address));
CREATE INDEX IF NOT EXISTS idx_wallets_status ON wallets (status);

-- =====================================================
-- TRADES: Все сделки (свои + copy trading)
-- =====================================================
CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,

    -- Идентификация
    external_id VARCHAR(255) UNIQUE,  -- ID из Polymarket API (если есть)
    transaction_hash VARCHAR(66),

    -- Источник
    source VARCHAR(20) NOT NULL DEFAULT 'bot' CHECK (source IN ('bot', 'copy', 'manual')),
    wallet_address VARCHAR(42),  -- Для copy trading

    -- Рынок
    condition_id VARCHAR(255) NOT NULL,
    market_slug VARCHAR(255),
    question TEXT,

    -- Детали сделки
    side VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
    outcome VARCHAR(3) NOT NULL CHECK (outcome IN ('Yes', 'No')),
    token_id VARCHAR(255) NOT NULL,
    price DECIMAL(10, 6) NOT NULL,
    size DECIMAL(18, 6) NOT NULL,
    notional DECIMAL(18, 6) NOT NULL,  -- price * size
    fee DECIMAL(18, 6) DEFAULT 0,

    -- Статус
    status VARCHAR(20) NOT NULL DEFAULT 'filled' CHECK (status IN ('pending', 'filled', 'cancelled', 'failed')),
    processed BOOLEAN NOT NULL DEFAULT FALSE,  -- Для copy trading

    -- Timestamps
    trade_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_external_id ON trades (external_id);
CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades (LOWER(wallet_address));
CREATE INDEX IF NOT EXISTS idx_trades_condition_id ON trades (condition_id);
CREATE INDEX IF NOT EXISTS idx_trades_token_id ON trades (token_id);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades (trade_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trades_source ON trades (source);
CREATE INDEX IF NOT EXISTS idx_trades_unprocessed ON trades (processed) WHERE NOT processed;

-- =====================================================
-- POSITIONS: Открытые и закрытые позиции
-- =====================================================
CREATE TABLE IF NOT EXISTS positions (
    id SERIAL PRIMARY KEY,

    -- Идентификация
    token_id VARCHAR(255) NOT NULL,
    condition_id VARCHAR(255) NOT NULL,
    market_slug VARCHAR(255),
    question TEXT,

    -- Детали позиции
    outcome VARCHAR(3) NOT NULL CHECK (outcome IN ('Yes', 'No')),
    side VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),  -- Направление входа
    size DECIMAL(18, 6) NOT NULL,
    average_price DECIMAL(10, 6) NOT NULL,

    -- Текущее состояние
    current_price DECIMAL(10, 6),
    unrealized_pnl DECIMAL(18, 6),
    realized_pnl DECIMAL(18, 6) DEFAULT 0,

    -- Статус
    status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'partial')),

    -- Источник
    source VARCHAR(20) NOT NULL DEFAULT 'bot' CHECK (source IN ('bot', 'copy', 'manual')),
    strategy VARCHAR(50),  -- Название стратегии (AIStrategy, HighConfidence, etc.)

    -- Timestamps
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_positions_token_id ON positions (token_id);
CREATE INDEX IF NOT EXISTS idx_positions_condition_id ON positions (condition_id);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions (status);
CREATE INDEX IF NOT EXISTS idx_positions_open ON positions (status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_positions_strategy ON positions (strategy);

-- =====================================================
-- ORDERS: Размещенные ордера
-- =====================================================
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,

    -- Идентификация
    order_id VARCHAR(255) NOT NULL UNIQUE,

    -- Рынок
    token_id VARCHAR(255) NOT NULL,
    condition_id VARCHAR(255) NOT NULL,
    market_slug VARCHAR(255),

    -- Детали ордера
    side VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
    price DECIMAL(10, 6) NOT NULL,
    size DECIMAL(18, 6) NOT NULL,
    filled_size DECIMAL(18, 6) NOT NULL DEFAULT 0,

    -- Статус
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'partial', 'cancelled', 'expired', 'failed')),
    order_type VARCHAR(10) NOT NULL DEFAULT 'GTC' CHECK (order_type IN ('GTC', 'GTD', 'FOK')),

    -- Источник
    source VARCHAR(20) NOT NULL DEFAULT 'bot' CHECK (source IN ('bot', 'copy', 'manual')),
    strategy VARCHAR(50),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    filled_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders (order_id);
CREATE INDEX IF NOT EXISTS idx_orders_token_id ON orders (token_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_pending ON orders (status) WHERE status IN ('pending', 'partial');

-- =====================================================
-- SIGNALS: Торговые сигналы (copy trading + AI)
-- =====================================================
CREATE TABLE IF NOT EXISTS signals (
    id SERIAL PRIMARY KEY,

    -- Идентификация
    signal_id VARCHAR(255) NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,

    -- Источник сигнала
    source VARCHAR(20) NOT NULL CHECK (source IN ('copy', 'ai', 'strategy')),
    wallet_address VARCHAR(42),  -- Для copy trading
    wallet_name VARCHAR(255),
    strategy VARCHAR(50),  -- Для AI/strategy сигналов

    -- Рынок
    condition_id VARCHAR(255) NOT NULL,
    market_slug VARCHAR(255),
    question TEXT,
    token_id VARCHAR(255),

    -- Сигнал
    action VARCHAR(10) NOT NULL CHECK (action IN ('BUY', 'SELL', 'FOLLOW', 'IGNORE', 'HOLD')),
    side VARCHAR(4) CHECK (side IN ('BUY', 'SELL')),
    outcome VARCHAR(3) CHECK (outcome IN ('Yes', 'No')),

    -- Рекомендации
    confidence DECIMAL(5, 4) NOT NULL DEFAULT 0,  -- 0-1
    suggested_price DECIMAL(10, 6),
    suggested_size DECIMAL(18, 6),
    max_price DECIMAL(10, 6),  -- Максимальная цена для входа

    -- Анализ
    reasons TEXT[] NOT NULL DEFAULT '{}',
    metadata JSONB,  -- Дополнительные данные

    -- Исполнение
    executed BOOLEAN NOT NULL DEFAULT FALSE,
    executed_at TIMESTAMP WITH TIME ZONE,
    order_id VARCHAR(255),  -- Ссылка на созданный ордер

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_signal_id ON signals (signal_id);
CREATE INDEX IF NOT EXISTS idx_signals_source ON signals (source);
CREATE INDEX IF NOT EXISTS idx_signals_wallet ON signals (LOWER(wallet_address));
CREATE INDEX IF NOT EXISTS idx_signals_condition_id ON signals (condition_id);
CREATE INDEX IF NOT EXISTS idx_signals_action ON signals (action);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_unexecuted ON signals (executed) WHERE NOT executed;

-- =====================================================
-- AI_ANALYSIS: Кэш AI анализа рынков
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_analysis (
    id SERIAL PRIMARY KEY,

    -- Рынок
    condition_id VARCHAR(255) NOT NULL,
    market_slug VARCHAR(255),
    question TEXT NOT NULL,

    -- AI оценка
    ai_probability DECIMAL(5, 4) NOT NULL,  -- Оценка AI (0-1)
    market_price DECIMAL(5, 4) NOT NULL,    -- Рыночная цена
    edge DECIMAL(6, 4) NOT NULL,            -- Разница (edge)

    -- Скоринг
    attractiveness DECIMAL(5, 2) NOT NULL,  -- 0-100
    risk_level VARCHAR(10) NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),

    -- Анализ
    reasoning TEXT NOT NULL,
    news_summary TEXT,
    key_factors TEXT[],

    -- Метаданные
    model VARCHAR(50),  -- gpt-4, gemini-pro, etc.
    tokens_used INTEGER,
    cost_usd DECIMAL(10, 6),

    -- Кэширование
    analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Unique constraint для upsert
    CONSTRAINT unique_ai_analysis_condition UNIQUE (condition_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_condition_id ON ai_analysis (condition_id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_expires_at ON ai_analysis (expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_attractiveness ON ai_analysis (attractiveness DESC);

-- =====================================================
-- BOT_STATS: Статистика работы бота
-- =====================================================
CREATE TABLE IF NOT EXISTS bot_stats (
    id SERIAL PRIMARY KEY,

    -- Период
    date DATE NOT NULL,
    strategy VARCHAR(50),  -- NULL = общая статистика

    -- Торговая статистика
    total_trades INTEGER NOT NULL DEFAULT 0,
    winning_trades INTEGER NOT NULL DEFAULT 0,
    losing_trades INTEGER NOT NULL DEFAULT 0,

    -- Финансы
    total_volume DECIMAL(18, 6) NOT NULL DEFAULT 0,
    total_pnl DECIMAL(18, 6) NOT NULL DEFAULT 0,
    total_fees DECIMAL(18, 6) NOT NULL DEFAULT 0,

    -- AI статистика
    ai_calls INTEGER NOT NULL DEFAULT 0,
    ai_cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Unique per day/strategy
    CONSTRAINT unique_bot_stats_day_strategy UNIQUE (date, strategy)
);

CREATE INDEX IF NOT EXISTS idx_bot_stats_date ON bot_stats (date DESC);
CREATE INDEX IF NOT EXISTS idx_bot_stats_strategy ON bot_stats (strategy);

-- =====================================================
-- PRICE_HISTORY: История цен для анализа
-- =====================================================
CREATE TABLE IF NOT EXISTS price_history (
    id SERIAL PRIMARY KEY,

    condition_id VARCHAR(255) NOT NULL,
    token_id VARCHAR(255) NOT NULL,

    price DECIMAL(10, 6) NOT NULL,
    bid DECIMAL(10, 6),
    ask DECIMAL(10, 6),
    spread DECIMAL(10, 6),

    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_condition ON price_history (condition_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_token ON price_history (token_id, recorded_at DESC);

-- Партиционирование по времени (опционально, для больших объемов)
-- CREATE INDEX IF NOT EXISTS idx_price_history_time ON price_history (recorded_at DESC);

-- =====================================================
-- MIGRATIONS: Служебная таблица миграций
-- =====================================================
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Record this migration
INSERT INTO migrations (name) VALUES ('001_initial') ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггеры для автоматического обновления updated_at
CREATE OR REPLACE TRIGGER update_markets_updated_at
    BEFORE UPDATE ON markets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_wallets_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_positions_updated_at
    BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_bot_stats_updated_at
    BEFORE UPDATE ON bot_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
