# База данных

PostgreSQL база данных для хранения истории торговли, сигналов и статистики.

## Настройка

### 1. Создание базы данных

Создайте PostgreSQL базу данных (локально или в облаке):

```sql
CREATE DATABASE polymarketdb;
```

### 2. Настройка переменных окружения

Добавьте `DATABASE_URL` в `.env`:

```bash
DATABASE_URL=postgres://user:password@host:5432/polymarketdb
```

**Примеры:**

```bash
# Локальная база
DATABASE_URL=postgres://postgres:password@localhost:5432/polymarketdb

# Supabase
DATABASE_URL=postgres://user:pass@db.xxx.supabase.co:5432/postgres

# Railway
DATABASE_URL=postgres://user:pass@containers-us-west-xxx.railway.app:5432/railway
```

### 3. Применение миграций

Примените миграции для создания схемы:

```bash
npm run db:migrate
```

Проверьте статус миграций:

```bash
npm run db:status
```

## Схема данных

### markets

Кэш данных о рынках Polymarket.

```sql
CREATE TABLE markets (
  condition_id VARCHAR(66) PRIMARY KEY,
  question TEXT NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true,
  closed BOOLEAN DEFAULT false,
  archived BOOLEAN DEFAULT false,
  volume NUMERIC,
  liquidity NUMERIC,
  tokens JSONB,
  category VARCHAR(100),
  tags TEXT[],
  end_date_iso TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Поля:**
- `condition_id` — уникальный ID рынка
- `question` — вопрос рынка
- `tokens` — JSON с токенами YES/NO
- `end_date_iso` — дата разрешения

### wallets

Отслеживаемые кошельки для copy trading.

```sql
CREATE TABLE wallets (
  address VARCHAR(42) PRIMARY KEY,
  name VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active',
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  roi NUMERIC DEFAULT 0,
  total_volume NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Поля:**
- `address` — адрес кошелька
- `status` — active/paused/blocked
- `roi` — доходность кошелька

### trades

Все сделки (свои + copy trading).

```sql
CREATE TABLE trades (
  id SERIAL PRIMARY KEY,
  trade_id VARCHAR(255) UNIQUE,
  source VARCHAR(50) NOT NULL,  -- 'bot', 'copy', 'manual'
  condition_id VARCHAR(66),
  token_id VARCHAR(66),
  side VARCHAR(10) NOT NULL,     -- 'BUY', 'SELL'
  outcome VARCHAR(10),            -- 'Yes', 'No'
  price NUMERIC NOT NULL,
  size NUMERIC NOT NULL,
  notional NUMERIC NOT NULL,
  fee NUMERIC DEFAULT 0,
  fee_rate_bps INTEGER,
  strategy VARCHAR(100),
  trade_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Поля:**
- `source` — источник сделки (bot/copy/manual)
- `side` — направление (BUY/SELL)
- `notional` — стоимость в USDC

### positions

Открытые и закрытые позиции.

```sql
CREATE TABLE positions (
  id SERIAL PRIMARY KEY,
  token_id VARCHAR(66) NOT NULL,
  condition_id VARCHAR(66) NOT NULL,
  size NUMERIC NOT NULL,
  average_price NUMERIC NOT NULL,
  current_price NUMERIC,
  unrealized_pnl NUMERIC DEFAULT 0,
  realized_pnl NUMERIC DEFAULT 0,
  status VARCHAR(20) DEFAULT 'open',  -- 'open', 'closed', 'partial'
  strategy VARCHAR(100),
  opened_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Поля:**
- `size` — размер позиции
- `average_price` — средняя цена входа
- `unrealized_pnl` — нереализованная прибыль/убыток
- `status` — статус позиции

### orders

Размещенные ордера.

```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(255) UNIQUE NOT NULL,
  condition_id VARCHAR(66),
  token_id VARCHAR(66) NOT NULL,
  side VARCHAR(10) NOT NULL,
  price NUMERIC NOT NULL,
  size NUMERIC NOT NULL,
  filled_size NUMERIC DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'filled', 'partial', 'cancelled'
  strategy VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Поля:**
- `order_id` — ID от Polymarket
- `filled_size` — исполненный размер
- `status` — статус ордера

### signals

Торговые сигналы (copy trading + AI).

```sql
CREATE TABLE signals (
  id SERIAL PRIMARY KEY,
  signal_id VARCHAR(255) UNIQUE,
  source VARCHAR(50) NOT NULL,  -- 'copy', 'ai', 'strategy'
  action VARCHAR(20) NOT NULL,  -- 'BUY', 'SELL', 'FOLLOW', 'IGNORE'
  condition_id VARCHAR(66),
  token_id VARCHAR(66),
  confidence NUMERIC,            -- 0-1
  suggested_price NUMERIC,
  suggested_size NUMERIC,
  reasons TEXT[],
  executed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Поля:**
- `source` — источник сигнала
- `action` — действие
- `confidence` — уверенность (0-1)
- `executed` — выполнен ли сигнал

### ai_analysis

Кэш AI анализа рынков.

```sql
CREATE TABLE ai_analysis (
  id SERIAL PRIMARY KEY,
  condition_id VARCHAR(66) NOT NULL,
  ai_probability NUMERIC,
  market_price NUMERIC,
  edge NUMERIC,
  attractiveness NUMERIC,
  risk_level VARCHAR(20),
  reasoning TEXT,
  news_summary TEXT,
  cost_usd NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(condition_id, created_at)
);
```

**Поля:**
- `ai_probability` — оценка AI вероятности
- `edge` — разница с рыночной ценой
- `cost_usd` — стоимость запроса

### bot_stats

Ежедневная статистика бота.

```sql
CREATE TABLE bot_stats (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  strategy VARCHAR(100) NOT NULL,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  total_volume NUMERIC DEFAULT 0,
  total_pnl NUMERIC DEFAULT 0,
  total_fees NUMERIC DEFAULT 0,
  ai_calls INTEGER DEFAULT 0,
  ai_cost_usd NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(date, strategy)
);
```

**Поля:**
- `date` — дата статистики
- `strategy` — название стратегии
- `total_pnl` — общая прибыль/убыток

## Миграции

### Применение миграций

```bash
npm run db:migrate
```

### Статус миграций

```bash
npm run db:status
```

### Откат миграций

```bash
npm run db:rollback
```

### Создание новой миграции

Создайте файл в `src/database/migrations/`:

```sql
-- 002_add_new_column.sql
ALTER TABLE markets ADD COLUMN new_column VARCHAR(255);
```

## Использование в коде

### PostgresAdapter

```typescript
import { PostgresAdapter } from './database/PostgresAdapter';

const db = new PostgresAdapter(process.env.DATABASE_URL);

// Сохранение сделки
await db.saveTrade({
  trade_id: '0x123...',
  source: 'bot',
  side: 'BUY',
  price: 0.95,
  size: 100,
  // ...
});

// Получение позиций
const positions = await db.getPositions({
  status: 'open',
  strategy: 'endgame'
});

// Статистика
const stats = await db.getStats(7); // за 7 дней
```

## Запросы и аналитика

### Примеры SQL запросов

**Топ-10 рынков по объему:**

```sql
SELECT condition_id, question, volume
FROM markets
WHERE active = true
ORDER BY volume DESC
LIMIT 10;
```

**Прибыльность по стратегиям:**

```sql
SELECT strategy, 
       SUM(total_pnl) as total_pnl,
       AVG(total_pnl) as avg_pnl
FROM bot_stats
WHERE date >= NOW() - INTERVAL '30 days'
GROUP BY strategy;
```

**ROI кошельков:**

```sql
SELECT address, name, roi, total_trades
FROM wallets
WHERE status = 'active'
ORDER BY roi DESC;
```

## Резервное копирование

### Экспорт данных

```bash
pg_dump $DATABASE_URL > backup.sql
```

### Импорт данных

```bash
psql $DATABASE_URL < backup.sql
```

## Оптимизация

### Индексы

Важные индексы уже созданы в миграциях:

```sql
CREATE INDEX idx_trades_condition_id ON trades(condition_id);
CREATE INDEX idx_trades_timestamp ON trades(trade_timestamp);
CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_signals_source ON signals(source);
```

### Очистка старых данных

```sql
-- Удаление старых сигналов (старше 30 дней)
DELETE FROM signals 
WHERE created_at < NOW() - INTERVAL '30 days' 
AND executed = true;

-- Архивация закрытых позиций
UPDATE positions 
SET status = 'archived' 
WHERE status = 'closed' 
AND closed_at < NOW() - INTERVAL '90 days';
```

## Troubleshooting

### Подключение не работает

1. Проверьте `DATABASE_URL` в `.env`
2. Убедитесь, что база данных доступна
3. Проверьте права доступа пользователя

### Миграции не применяются

1. Проверьте логи: `npm run db:status`
2. Убедитесь, что таблицы не существуют
3. Проверьте права на создание таблиц

### Медленные запросы

1. Проверьте наличие индексов
2. Используйте `EXPLAIN ANALYZE` для анализа
3. Оптимизируйте частые запросы

