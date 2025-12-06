# Техническое задание: Wallet Intelligence (Copy Trading)

> **Версия:** 1.0
> **Дата:** 2025-12-06
> **Статус:** Draft

---

## 1. Цель и границы

### 1.1. Что делаем

Сервис **Wallet Intelligence** для Polymarket, который:

1. **Находит успешных трейдеров** — анализирует историю сделок и ранжирует кошельки по ROI/винрейту
2. **Отслеживает их сделки в реальном времени** — через WebSocket или поллинг Polymarket Data API
3. **Генерирует сигналы** — для каждой сделки отдаёт событие с решением `FOLLOW | IGNORE | REVIEW`

### 1.2. Что НЕ делаем

- **Не выставляем ордера** — это делает существующий торговый модуль (`bot-ai.ts`, `index.ts`)
- **Не храним приватные ключи** — сервис только читает публичные данные
- **Не делаем UI** — только API и события

### 1.3. Интеграция с существующим кодом

```
┌─────────────────────────────────────────────────────────────────┐
│                    Wallet Intelligence                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Discovery  │  │   Realtime   │  │  Scoring & Decision  │  │
│  │   Module     │→ │   Watcher    │→ │       Module         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ TradeSignal events
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Существующий торговый модуль                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  AIStrategy  │  │   Endgame    │  │  CopyTradingStrategy │  │ ← НОВАЯ
│  │              │  │   Strategy   │  │     (adapter)        │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                             │                                    │
│                             ▼                                    │
│                    ClobClient.createOrder()                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Источники данных

### 2.1. Polymarket Data API

**Базовый URL:** `https://data-api.polymarket.com` или `https://clob.polymarket.com`

#### Эндпоинты для истории сделок

```bash
# Сделки конкретного кошелька
GET /trades?user=<proxyWallet>&limit=500&takerOnly=true

# Все сделки (для real-time поллинга)
GET /trades?limit=100
```

**Поля ответа:**
```typescript
interface PolymarketTrade {
    id: string;
    taker_order_id: string;
    market: string;              // slug рынка
    asset_id: string;            // token_id
    side: 'BUY' | 'SELL';
    size: string;                // количество токенов
    fee_rate_bps: string;
    price: string;               // цена исполнения
    status: 'MATCHED' | 'MINED';
    match_time: string;          // timestamp
    last_update: string;
    outcome: string;             // 'Yes' | 'No'
    bucket_index: number;
    owner: string;               // адрес кошелька
    maker_address: string;
    transaction_hash: string;
    trader_side: 'TAKER' | 'MAKER';

    // Дополнительные поля для удобства
    title?: string;              // вопрос рынка
    slug?: string;               // slug для URL
    conditionId?: string;        // condition_id рынка
}
```

### 2.2. Режим работы: Cron (каждые 5 минут)

**Простая архитектура без WebSocket:**

```
┌─────────────────────────────────────────────────────────────┐
│                    Cron Job (каждые 5 мин)                  │
│                                                             │
│  1. Загрузить watchlist кошельков                          │
│  2. Для каждого кошелька:                                  │
│     GET /trades?user=<wallet>&limit=20                     │
│  3. Фильтровать сделки за последние 5 минут                │
│  4. Для новых сделок → scoring → signal                    │
│  5. Сохранить last_checked_at                              │
└─────────────────────────────────────────────────────────────┘
```

**Преимущества:**
- Простота реализации
- Нет постоянного соединения
- Легко масштабировать
- Достаточно для copy trading (5 мин задержка приемлема)

**Запуск:**
```bash
# Через cron
*/5 * * * * cd /path/to/bot && npm run check-wallets

# Или через node-cron в процессе
npm run start:wallet-monitor
```

### 2.3. Внешние источники для Discovery

| Источник | Тип | Описание |
|----------|-----|----------|
| Polymarket Leaderboard | Scraping | Top traders по PnL |
| polywhaler.com | API/Scraping | Whale tracking |
| polymarket-tracker.com | API | Whale activity |
| Ручной ввод | API | Добавление через `/wallets/manual` |

---

## 3. Архитектура сервиса

### 3.1. Модули (упрощенная структура)

```
src/
├── copy-trading/
│   ├── services/
│   │   ├── WalletMonitor.ts          # Основной cron job
│   │   ├── WalletEvaluator.ts        # Расчет метрик кошелька
│   │   ├── TradesFetcher.ts          # Получение сделок из API
│   │   └── SignalEmitter.ts          # Генерация сигналов
│   │
│   ├── scoring/
│   │   ├── DecisionEngine.ts         # Решения FOLLOW/IGNORE
│   │   └── rules.ts                  # Правила скоринга
│   │
│   ├── storage/
│   │   ├── WalletStore.ts            # JSON файл с кошельками
│   │   └── ProcessedTradesCache.ts   # Кэш обработанных сделок
│   │
│   ├── types/
│   │   └── index.ts                  # Все типы
│   │
│   └── index.ts                      # Entry point для cron
│
├── strategies/
│   └── CopyTradingStrategy.ts        # Стратегия для бота
│
└── scripts/
    ├── check-wallets.ts              # npm run check-wallets
    └── add-wallet.ts                 # npm run add-wallet <address>
```

### 3.2. Модуль Discovery

**Цель:** Найти и оценить успешных трейдеров

```typescript
// src/wallet-intelligence/types/wallet.types.ts

export interface WalletProfile {
    proxyWallet: string;           // Polygon адрес
    displayName?: string;          // Если есть ENS/имя
    source: 'leaderboard' | 'polywhaler' | 'manual' | 'referral';
    status: 'candidate' | 'active' | 'blocked' | 'paused';

    // Статистика
    stats: WalletStats;

    // Метаданные
    createdAt: Date;
    lastEvaluatedAt: Date;
    lastTradeAt?: Date;
}

export interface WalletStats {
    // Основные метрики
    totalTrades: number;
    totalVolume: number;          // В USDC
    winRate: number;              // 0-1
    roi: number;                  // Доходность (0.15 = 15%)

    // За период (90 дней по умолчанию)
    period: {
        days: number;
        trades: number;
        volume: number;
        winRate: number;
        roi: number;
        avgTradeSize: number;
        maxDrawdown: number;      // Максимальная просадка
    };

    // Распределение по категориям
    categoryBreakdown: {
        [category: string]: {
            trades: number;
            winRate: number;
            roi: number;
        };
    };
}

// Критерии для включения в watchlist
export interface WalletCriteria {
    minTrades: number;            // Минимум сделок (default: 20)
    minVolume: number;            // Минимум объема USDC (default: 5000)
    minRoi: number;               // Минимум ROI (default: 0.10 = 10%)
    minWinRate: number;           // Минимум винрейт (default: 0.55)
    maxDrawdown: number;          // Макс просадка (default: 0.30)
    periodDays: number;           // Период оценки (default: 90)
}
```

**Алгоритм оценки кошелька:**

```typescript
// src/wallet-intelligence/discovery/WalletEvaluator.ts

export class WalletEvaluator {

    async evaluateWallet(proxyWallet: string): Promise<WalletStats> {
        // 1. Получаем историю сделок
        const trades = await this.fetchTrades(proxyWallet, 500);

        // 2. Фильтруем по периоду
        const periodTrades = this.filterByPeriod(trades, 90);

        // 3. Получаем resolved markets для расчета PnL
        const resolvedMarkets = await this.getResolvedMarkets(periodTrades);

        // 4. Рассчитываем метрики
        return {
            totalTrades: trades.length,
            totalVolume: this.calculateVolume(trades),
            winRate: this.calculateWinRate(trades, resolvedMarkets),
            roi: this.calculateROI(trades, resolvedMarkets),
            period: {
                days: 90,
                trades: periodTrades.length,
                volume: this.calculateVolume(periodTrades),
                winRate: this.calculateWinRate(periodTrades, resolvedMarkets),
                roi: this.calculateROI(periodTrades, resolvedMarkets),
                avgTradeSize: this.calculateAvgTradeSize(periodTrades),
                maxDrawdown: this.calculateMaxDrawdown(periodTrades, resolvedMarkets)
            },
            categoryBreakdown: this.calculateCategoryBreakdown(trades, resolvedMarkets)
        };
    }

    /**
     * Расчет ROI
     *
     * Для каждой сделки:
     * - BUY YES @ 0.60: если рынок resolved YES → profit = (1 - 0.60) * size
     * - BUY YES @ 0.60: если рынок resolved NO → loss = -0.60 * size
     *
     * ROI = total_profit / total_invested
     */
    private calculateROI(
        trades: PolymarketTrade[],
        resolvedMarkets: Map<string, 'Yes' | 'No'>
    ): number {
        let totalInvested = 0;
        let totalProfit = 0;

        for (const trade of trades) {
            if (trade.side !== 'BUY') continue;

            const resolution = resolvedMarkets.get(trade.conditionId);
            if (!resolution) continue; // Рынок еще не resolved

            const invested = parseFloat(trade.price) * parseFloat(trade.size);
            totalInvested += invested;

            const won = (trade.outcome === resolution);
            if (won) {
                totalProfit += parseFloat(trade.size) - invested;
            } else {
                totalProfit -= invested;
            }
        }

        return totalInvested > 0 ? totalProfit / totalInvested : 0;
    }
}
```

### 3.3. Модуль WalletMonitor (Cron-based)

**Цель:** Каждые 5 минут проверять сделки кошельков из watchlist

```typescript
// src/copy-trading/types/index.ts

export interface WatchedWallet {
    address: string;               // proxyWallet (Polygon)
    name?: string;                 // Название для логов
    status: 'active' | 'paused';
    addedAt: Date;
    lastCheckedAt?: Date;

    // Статистика (обновляется периодически)
    stats?: WalletStats;
}

export interface WalletTrade {
    id: string;
    wallet: string;
    transactionHash: string;

    // Рынок
    conditionId: string;
    slug: string;
    question: string;

    // Сделка
    side: 'BUY' | 'SELL';
    outcome: 'Yes' | 'No';
    tokenId: string;
    price: number;
    size: number;
    notional: number;              // price * size в USDC

    timestamp: Date;
}

export interface CopySignal {
    id: string;
    wallet: string;
    trade: WalletTrade;

    action: 'FOLLOW' | 'IGNORE';
    confidence: number;
    reasons: string[];

    // Рекомендации
    suggestedSize?: number;
    maxPrice?: number;

    createdAt: Date;
}

// src/copy-trading/services/WalletMonitor.ts

export class WalletMonitor {
    constructor(
        private tradesFetcher: TradesFetcher,
        private decisionEngine: DecisionEngine,
        private signalEmitter: SignalEmitter,
        private walletStore: WalletStore,
        private processedCache: ProcessedTradesCache
    ) {}

    /**
     * Основной метод — запускается каждые 5 минут
     */
    async checkAllWallets(): Promise<CopySignal[]> {
        const signals: CopySignal[] = [];
        const wallets = await this.walletStore.getActiveWallets();

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`🔍 Checking ${wallets.length} wallets for new trades`);
        console.log(`⏰ ${new Date().toLocaleString()}`);
        console.log(`${'═'.repeat(60)}\n`);

        for (const wallet of wallets) {
            try {
                const walletSignals = await this.checkWallet(wallet);
                signals.push(...walletSignals);
            } catch (error) {
                console.error(`❌ Error checking ${wallet.name || wallet.address}:`, error);
            }
        }

        // Обновляем lastCheckedAt
        await this.walletStore.updateLastChecked(wallets.map(w => w.address));

        console.log(`\n✅ Check complete. Generated ${signals.length} signals.\n`);
        return signals;
    }

    /**
     * Проверка одного кошелька
     */
    private async checkWallet(wallet: WatchedWallet): Promise<CopySignal[]> {
        const signals: CopySignal[] = [];

        // 1. Получаем последние сделки (за 10 минут с запасом)
        const trades = await this.tradesFetcher.getRecentTrades(
            wallet.address,
            10 * 60 * 1000  // 10 минут
        );

        if (trades.length === 0) {
            return signals;
        }

        console.log(`\n📊 ${wallet.name || wallet.address.slice(0, 10)}...`);
        console.log(`   Found ${trades.length} trades in last 10 min`);

        // 2. Фильтруем уже обработанные
        const newTrades = trades.filter(
            t => !this.processedCache.isProcessed(t.id)
        );

        if (newTrades.length === 0) {
            console.log(`   All trades already processed`);
            return signals;
        }

        console.log(`   New trades: ${newTrades.length}`);

        // 3. Для каждой новой сделки — scoring
        for (const trade of newTrades) {
            const signal = await this.decisionEngine.evaluate(trade, wallet);

            console.log(`   ${signal.action === 'FOLLOW' ? '✅' : '⏭️'} ${trade.side} ${trade.outcome} @ ${(trade.price * 100).toFixed(1)}%`);
            console.log(`      ${trade.question.slice(0, 50)}...`);
            console.log(`      Size: $${trade.notional.toFixed(2)}, Confidence: ${(signal.confidence * 100).toFixed(0)}%`);

            if (signal.action === 'FOLLOW') {
                signals.push(signal);
                await this.signalEmitter.emit(signal);
            }

            // Помечаем как обработанную
            this.processedCache.markProcessed(trade.id);
        }

        return signals;
    }
}

// src/copy-trading/index.ts — Entry point для cron

import { WalletMonitor } from './services/WalletMonitor';
// ... imports

async function main() {
    const monitor = new WalletMonitor(/* ... */);

    try {
        const signals = await monitor.checkAllWallets();

        if (signals.length > 0) {
            console.log('\n📨 Generated signals:');
            for (const sig of signals) {
                console.log(`   ${sig.wallet.slice(0, 10)}... → ${sig.trade.side} ${sig.trade.outcome}`);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Monitor failed:', error);
        process.exit(1);
    }
}

main();
```

### 3.4. Модуль Scoring & Decision

**Цель:** Для каждой сделки решить — копировать или нет

```typescript
// src/wallet-intelligence/types/signal.types.ts

export type TradeAction = 'FOLLOW' | 'IGNORE' | 'REVIEW';

export interface CopyTradeSignal {
    eventType: 'WALLET_TRADE';

    // Кошелек
    wallet: string;
    walletScore: number;           // 0-1, общий скор кошелька
    walletStats: WalletStats;      // Актуальная статистика

    // Решение
    action: TradeAction;
    confidence: number;            // 0-1
    reasons: string[];             // Почему такое решение

    // Сделка
    trade: NormalizedTrade;

    // Рекомендации для торгового модуля
    recommendations?: {
        suggestedSize: number;     // Рекомендуемый размер
        maxPrice: number;          // Макс цена (чтобы не переплатить)
        urgency: 'high' | 'medium' | 'low';
    };

    // Метаданные
    timestamp: Date;
    signalId: string;
}

// src/wallet-intelligence/scoring/DecisionEngine.ts

export interface DecisionRule {
    name: string;
    priority: number;              // Чем выше, тем важнее
    evaluate(trade: NormalizedTrade, wallet: WalletProfile): RuleResult;
}

export interface RuleResult {
    action: TradeAction | null;    // null = правило не применимо
    confidence: number;
    reason: string;
}

export class DecisionEngine {
    private rules: DecisionRule[] = [];

    constructor(config: DecisionConfig) {
        this.initializeRules(config);
    }

    /**
     * Принятие решения по сделке
     */
    async decide(
        trade: NormalizedTrade,
        wallet: WalletProfile
    ): Promise<CopyTradeSignal> {
        const results: RuleResult[] = [];

        // Применяем все правила
        for (const rule of this.rules) {
            const result = rule.evaluate(trade, wallet);
            if (result.action !== null) {
                results.push(result);
            }
        }

        // Агрегируем результаты
        return this.aggregateResults(trade, wallet, results);
    }

    private initializeRules(config: DecisionConfig): void {
        // Правило 1: Минимальный размер сделки
        this.rules.push({
            name: 'MinNotional',
            priority: 100,
            evaluate: (trade, _wallet) => {
                if (trade.notional < config.minNotionalUsd) {
                    return {
                        action: 'IGNORE',
                        confidence: 1.0,
                        reason: `Trade size $${trade.notional} < min $${config.minNotionalUsd}`
                    };
                }
                return { action: null, confidence: 0, reason: '' };
            }
        });

        // Правило 2: Максимальная экспозиция на рынок
        this.rules.push({
            name: 'MaxExposure',
            priority: 90,
            evaluate: (trade, _wallet) => {
                // TODO: Проверить текущую экспозицию
                return { action: null, confidence: 0, reason: '' };
            }
        });

        // Правило 3: Drawdown кошелька
        this.rules.push({
            name: 'WalletDrawdown',
            priority: 80,
            evaluate: (_trade, wallet) => {
                if (wallet.stats.period.maxDrawdown > config.maxWalletDrawdown) {
                    return {
                        action: 'IGNORE',
                        confidence: 0.8,
                        reason: `Wallet drawdown ${(wallet.stats.period.maxDrawdown * 100).toFixed(1)}% > max ${config.maxWalletDrawdown * 100}%`
                    };
                }
                return { action: null, confidence: 0, reason: '' };
            }
        });

        // Правило 4: Высокий ROI кошелька → FOLLOW
        this.rules.push({
            name: 'HighROI',
            priority: 50,
            evaluate: (_trade, wallet) => {
                if (wallet.stats.period.roi > config.highRoiThreshold) {
                    return {
                        action: 'FOLLOW',
                        confidence: 0.7 + wallet.stats.period.roi * 0.3,
                        reason: `High ROI wallet: ${(wallet.stats.period.roi * 100).toFixed(1)}%`
                    };
                }
                return { action: null, confidence: 0, reason: '' };
            }
        });

        // Правило 5: Паттерн наращивания позиции
        this.rules.push({
            name: 'PositionIncrease',
            priority: 60,
            evaluate: (trade, wallet) => {
                if (trade.context?.isPositionIncrease && wallet.stats.period.winRate > 0.6) {
                    return {
                        action: 'FOLLOW',
                        confidence: 0.8,
                        reason: 'Position increase by high winrate wallet'
                    };
                }
                return { action: null, confidence: 0, reason: '' };
            }
        });
    }
}
```

---

## 4. API сервиса

### 4.1. Endpoints

```typescript
// GET /wallets
// Список кошельков в системе

interface GetWalletsQuery {
    status?: 'candidate' | 'active' | 'blocked' | 'paused';
    minRoi?: number;
    minVolume?: number;
    minWinRate?: number;
    limit?: number;
    offset?: number;
}

interface GetWalletsResponse {
    wallets: WalletProfile[];
    total: number;
    hasMore: boolean;
}

// GET /wallets/:address
// Детальная информация о кошельке

interface GetWalletResponse {
    wallet: WalletProfile;
    recentTrades: NormalizedTrade[];   // Последние 20 сделок
    performance: {
        daily: { date: string; pnl: number }[];
        weekly: { week: string; pnl: number }[];
    };
}

// POST /wallets/manual
// Добавить кошелек вручную

interface AddWalletRequest {
    proxyWallet: string;
    displayName?: string;
    autoActivate?: boolean;  // Сразу в active без проверки критериев
}

// PATCH /wallets/:address/status
// Изменить статус кошелька

interface UpdateWalletStatusRequest {
    status: 'active' | 'blocked' | 'paused';
    reason?: string;
}

// POST /config/rules
// Обновить правила скоринга

interface UpdateRulesRequest {
    minNotionalUsd?: number;
    maxExposurePercent?: number;
    maxWalletDrawdown?: number;
    highRoiThreshold?: number;
    // ... другие параметры
}

// GET /config/rules
// Текущие правила

// POST /webhooks/subscriptions
// Подписка на события

interface WebhookSubscription {
    url: string;
    events: ('WALLET_TRADE' | 'WALLET_ADDED' | 'WALLET_STATUS_CHANGED')[];
    secret?: string;           // Для подписи payload
    filters?: {
        minConfidence?: number;
        actions?: TradeAction[];
    };
}

// GET /signals/history
// История сигналов

interface GetSignalsQuery {
    wallet?: string;
    action?: TradeAction;
    from?: string;             // ISO date
    to?: string;
    limit?: number;
}
```

### 4.2. Webhook Events

```typescript
// POST на зарегистрированный URL

// Event: WALLET_TRADE
{
    "eventType": "WALLET_TRADE",
    "timestamp": "2025-12-06T15:30:00Z",
    "signalId": "sig_abc123",
    "wallet": "0x1234...",
    "walletScore": 0.87,
    "action": "FOLLOW",
    "confidence": 0.85,
    "reasons": [
        "High ROI wallet: 25.3%",
        "Position increase pattern"
    ],
    "trade": {
        "marketConditionId": "0xabc...",
        "marketTitle": "Will X happen?",
        "side": "BUY",
        "outcome": "Yes",
        "price": 0.65,
        "size": 500,
        "notional": 325
    },
    "recommendations": {
        "suggestedSize": 50,
        "maxPrice": 0.67,
        "urgency": "medium"
    }
}

// Headers
X-Webhook-Signature: sha256=abc123...   // HMAC подпись если есть secret
X-Webhook-Event: WALLET_TRADE
```

---

## 5. Интеграция с торговым модулем

### 5.1. Новая стратегия CopyTradingStrategy

```typescript
// src/strategies/CopyTradingStrategy.ts

import { IStrategy, TradeSignal, Market, Position } from '../types';
import { CopyTradeSignal } from '../wallet-intelligence/types/signal.types';

export interface CopyTradingConfig {
    // Общие
    enabled: boolean;
    webhookUrl?: string;           // URL для получения сигналов (если не polling)

    // Размеры
    copyRatio: number;             // 0.1 = 10% от размера whale
    maxTradeSize: number;          // Макс размер в USDC
    minTradeSize: number;          // Мин размер в USDC

    // Фильтры
    minConfidence: number;         // Мин confidence для FOLLOW
    allowedActions: ('FOLLOW')[];  // Какие actions обрабатывать

    // Ограничения
    maxDailyTrades: number;        // Макс сделок в день
    maxOpenPositions: number;      // Макс открытых позиций

    // Slippage
    maxSlippagePercent: number;    // Макс отклонение от цены whale
}

export class CopyTradingStrategy implements IStrategy {
    name = "Copy Trading Strategy";

    private pendingSignals: CopyTradeSignal[] = [];
    private todayTradeCount: number = 0;

    constructor(
        public config: CopyTradingConfig,
        private baseConfig: StrategyConfig
    ) {}

    /**
     * Получить сигнал от Wallet Intelligence
     */
    receiveSignal(signal: CopyTradeSignal): void {
        if (signal.action !== 'FOLLOW') return;
        if (signal.confidence < this.config.minConfidence) return;
        if (this.todayTradeCount >= this.config.maxDailyTrades) return;

        this.pendingSignals.push(signal);
    }

    /**
     * Генерация торговых сигналов на основе полученных copy-сигналов
     */
    generateSignals(market: Market, currentPrice: number, position?: Position): TradeSignal[] {
        const signals: TradeSignal[] = [];

        // Ищем pending сигнал для этого рынка
        const copySignal = this.pendingSignals.find(
            s => s.trade.marketConditionId === market.condition_id
        );

        if (!copySignal) return signals;

        // Проверяем slippage
        const whalePrace = copySignal.trade.price;
        const slippage = Math.abs(currentPrice - whalePrice) / whalePrice;
        if (slippage > this.config.maxSlippagePercent) {
            console.log(`⚠️ Slippage too high: ${(slippage * 100).toFixed(2)}%`);
            return signals;
        }

        // Рассчитываем размер
        let size = copySignal.trade.size * this.config.copyRatio;
        size = Math.max(size, this.config.minTradeSize);
        size = Math.min(size, this.config.maxTradeSize);

        // Используем рекомендации если есть
        if (copySignal.recommendations?.suggestedSize) {
            size = Math.min(size, copySignal.recommendations.suggestedSize);
        }

        const token = market.tokens.find(
            t => t.outcome === copySignal.trade.outcome
        );

        if (!token) return signals;

        signals.push({
            market,
            tokenId: token.token_id,
            side: copySignal.trade.side === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
            price: currentPrice,
            size,
            reason: `Copy: ${copySignal.wallet.slice(0, 10)}... (conf: ${(copySignal.confidence * 100).toFixed(0)}%)`
        });

        // Удаляем обработанный сигнал
        this.pendingSignals = this.pendingSignals.filter(s => s !== copySignal);
        this.todayTradeCount++;

        return signals;
    }

    // ... остальные методы IStrategy
}
```

### 5.2. Новый бот для copy trading

```typescript
// src/bot-copy.ts

import { CopyTradingStrategy } from './strategies/CopyTradingStrategy';
import { CopyTradeSignal } from './wallet-intelligence/types/signal.types';

// Создаем webhook сервер для получения сигналов
app.post('/signals', (req, res) => {
    const signal: CopyTradeSignal = req.body;

    // Валидация подписи
    if (!validateWebhookSignature(req)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    // Передаем в стратегию
    strategy.receiveSignal(signal);

    res.json({ received: true });
});
```

---

## 6. Хранение данных (JSON-файлы)

Для MVP используем простые JSON-файлы вместо базы данных.

### 6.1. Структура файлов

```
data/
├── wallets.json              # Список отслеживаемых кошельков
├── processed-trades.json     # Кэш обработанных trade_id
├── signals-history.json      # История сигналов (опционально)
└── config.json               # Настройки скоринга
```

### 6.2. wallets.json

```json
{
  "wallets": [
    {
      "address": "0x1234567890abcdef...",
      "name": "Whale #1",
      "status": "active",
      "addedAt": "2025-12-06T10:00:00Z",
      "lastCheckedAt": "2025-12-06T15:30:00Z",
      "stats": {
        "totalTrades": 150,
        "totalVolume": 50000,
        "roi": 0.25,
        "winRate": 0.62,
        "lastUpdated": "2025-12-06T12:00:00Z"
      }
    }
  ]
}
```

### 6.3. processed-trades.json

```json
{
  "processedIds": [
    "trade_abc123",
    "trade_def456"
  ],
  "lastCleanup": "2025-12-06T00:00:00Z"
}
```

Очистка: удаляем ID старше 24 часов при каждом запуске.

### 6.4. config.json

```json
{
  "scoring": {
    "minNotionalUsd": 50,
    "minWalletRoi": 0.10,
    "minWalletWinRate": 0.55,
    "maxWalletDrawdown": 0.30
  },
  "copy": {
    "copyRatio": 0.1,
    "maxTradeSize": 100,
    "minTradeSize": 5,
    "maxSlippagePercent": 0.05
  }
}
```

### 6.5. WalletStore.ts

```typescript
// src/copy-trading/storage/WalletStore.ts

import * as fs from 'fs';
import * as path from 'path';
import { WatchedWallet } from '../types';

const DATA_DIR = path.join(__dirname, '../../../data');
const WALLETS_FILE = path.join(DATA_DIR, 'wallets.json');

export class WalletStore {
    private ensureDataDir(): void {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    }

    async getActiveWallets(): Promise<WatchedWallet[]> {
        this.ensureDataDir();

        if (!fs.existsSync(WALLETS_FILE)) {
            return [];
        }

        const data = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf-8'));
        return data.wallets.filter((w: WatchedWallet) => w.status === 'active');
    }

    async addWallet(address: string, name?: string): Promise<void> {
        this.ensureDataDir();

        let data = { wallets: [] as WatchedWallet[] };
        if (fs.existsSync(WALLETS_FILE)) {
            data = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf-8'));
        }

        // Проверяем дубликат
        if (data.wallets.some(w => w.address.toLowerCase() === address.toLowerCase())) {
            throw new Error(`Wallet ${address} already exists`);
        }

        data.wallets.push({
            address: address.toLowerCase(),
            name,
            status: 'active',
            addedAt: new Date()
        });

        fs.writeFileSync(WALLETS_FILE, JSON.stringify(data, null, 2));
    }

    async updateLastChecked(addresses: string[]): Promise<void> {
        if (!fs.existsSync(WALLETS_FILE)) return;

        const data = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf-8'));
        const now = new Date();

        for (const wallet of data.wallets) {
            if (addresses.includes(wallet.address)) {
                wallet.lastCheckedAt = now;
            }
        }

        fs.writeFileSync(WALLETS_FILE, JSON.stringify(data, null, 2));
    }
}
```

### 6.6. ProcessedTradesCache.ts

```typescript
// src/copy-trading/storage/ProcessedTradesCache.ts

import * as fs from 'fs';
import * as path from 'path';

const CACHE_FILE = path.join(__dirname, '../../../data/processed-trades.json');
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 часа

interface CacheData {
    processedIds: string[];
    lastCleanup: string;
}

export class ProcessedTradesCache {
    private cache: Set<string> = new Set();

    constructor() {
        this.load();
    }

    private load(): void {
        if (!fs.existsSync(CACHE_FILE)) {
            return;
        }

        try {
            const data: CacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
            this.cache = new Set(data.processedIds);

            // Очистка старых записей раз в день
            const lastCleanup = new Date(data.lastCleanup).getTime();
            if (Date.now() - lastCleanup > MAX_AGE_MS) {
                this.cleanup();
            }
        } catch {
            this.cache = new Set();
        }
    }

    isProcessed(tradeId: string): boolean {
        return this.cache.has(tradeId);
    }

    markProcessed(tradeId: string): void {
        this.cache.add(tradeId);
        this.save();
    }

    private save(): void {
        const data: CacheData = {
            processedIds: Array.from(this.cache),
            lastCleanup: new Date().toISOString()
        };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
    }

    private cleanup(): void {
        // Для простоты очищаем весь кэш раз в 24 часа
        // В production можно хранить timestamp для каждого ID
        this.cache.clear();
        this.save();
        console.log('🗑️ Cleaned up processed trades cache');
    }
}
```

---

## 7. Конфигурация

### 7.1. Environment Variables

В существующий `.env` добавляются:

```bash
# Copy Trading (опционально, можно использовать defaults)
COPY_TRADING_ENABLED=true
COPY_TRADING_MIN_NOTIONAL=50
COPY_TRADING_COPY_RATIO=0.1
COPY_TRADING_MAX_TRADE_SIZE=100
```

### 7.2. Конфиг файл

```typescript
// src/copy-trading/config.ts

export const COPY_TRADING_CONFIG = {
    // Интервал проверки (в минутах)
    checkIntervalMinutes: 5,

    // Окно поиска сделок (с запасом)
    tradeWindowMinutes: 10,

    // Скоринг кошельков
    scoring: {
        minNotionalUsd: 50,           // Игнорировать сделки меньше $50
        minWalletRoi: 0.10,           // Мин ROI кошелька 10%
        minWalletWinRate: 0.55,       // Мин винрейт 55%
        minWalletTrades: 20,          // Мин количество сделок
    },

    // Параметры копирования
    copy: {
        copyRatio: 0.1,               // Копируем 10% от размера whale
        maxTradeSize: 100,            // Макс $100 за сделку
        minTradeSize: 5,              // Мин $5 за сделку
        maxSlippagePercent: 0.05,     // Макс 5% slippage
    },

    // API endpoints
    api: {
        tradesUrl: 'https://data-api.polymarket.com/trades',
        marketsUrl: 'https://clob.polymarket.com',
    }
};
```

---

## 8. Фазы реализации

### Phase 1: MVP (3-5 дней)

**Цель:** Минимальный работающий прототип с cron-based мониторингом

**Файлы для создания:**

```
src/copy-trading/
├── types/index.ts              # Типы
├── config.ts                   # Конфигурация
├── services/
│   ├── TradesFetcher.ts        # Получение сделок из API
│   ├── WalletMonitor.ts        # Основной cron job
│   └── SignalEmitter.ts        # Вывод сигналов (console + file)
├── scoring/
│   ├── DecisionEngine.ts       # Логика FOLLOW/IGNORE
│   └── rules.ts                # Правила скоринга
├── storage/
│   ├── WalletStore.ts          # JSON хранилище кошельков
│   └── ProcessedTradesCache.ts # Кэш обработанных сделок
└── index.ts                    # Entry point

scripts/
├── check-wallets.ts            # npm run check-wallets
├── add-wallet.ts               # npm run add-wallet
└── wallet-stats.ts             # npm run wallet-stats
```

**Задачи:**

- [ ] Типы: `WatchedWallet`, `WalletTrade`, `CopySignal`
- [ ] `TradesFetcher` — GET /trades?user=... с фильтрацией по времени
- [ ] `WalletStore` — CRUD для wallets.json
- [ ] `ProcessedTradesCache` — отслеживание обработанных trade_id
- [ ] `DecisionEngine` — 2-3 базовых правила (minNotional, walletROI)
- [ ] `WalletMonitor` — основной цикл проверки
- [ ] `SignalEmitter` — вывод в console + signals.json
- [ ] Скрипты: `check-wallets`, `add-wallet`
- [ ] Интеграция в package.json

**npm scripts:**

```json
{
  "check-wallets": "ts-node src/copy-trading/index.ts",
  "add-wallet": "ts-node scripts/add-wallet.ts",
  "wallet-stats": "ts-node scripts/wallet-stats.ts"
}
```

**Deliverables:**
- `npm run add-wallet 0x123...` — добавить кошелек
- `npm run check-wallets` — проверить сделки (cron каждые 5 мин)
- При новой сделке whale → сигнал в консоль + файл

### Phase 2: Интеграция с ботом (2-3 дня)

- [ ] `CopyTradingStrategy` — стратегия для существующего бота
- [ ] `bot-copy.ts` — бот который читает сигналы и исполняет
- [ ] Проверка ликвидности перед копированием
- [ ] Slippage protection

### Phase 3: Улучшения (опционально)

- [ ] Автоматический расчет статистики кошельков
- [ ] Discovery: парсинг leaderboard
- [ ] Telegram уведомления
- [ ] REST API для управления
- [ ] Бэктестинг

---

## 9. Риски и ограничения

### 9.1. Технические риски

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Rate limiting Polymarket API | Высокая | Кэширование, batching, backoff |
| Задержка сигналов (polling) | Средняя | WebSocket в Phase 2 |
| Неточность ROI расчета | Средняя | Учитывать только resolved markets |
| Slippage при копировании | Высокая | Лимиты на maxPrice, urgency |

### 9.2. Бизнес риски

| Риск | Митигация |
|------|-----------|
| Whale делает ошибку | Drawdown правило, diversification |
| Whale манипулирует | Минимальный размер, история trades |
| Рынок неликвидный | Проверка ликвидности перед copy |
| Whale выходит раньше нас | Отслеживать SELL сделки whale |

### 9.3. Ограничения MVP

- Только TAKER trades (MAKER сложнее отслеживать)
- Polling с задержкой 5 сек (не мгновенное)
- Ручное добавление кошельков
- Нет UI

---

## 10. Метрики успеха

### 10.1. Технические метрики

- Latency сигнала: < 10 сек от сделки whale до webhook
- Uptime сервиса: > 99%
- False positive rate: < 20% (сигналы FOLLOW которые не нужны)

### 10.2. Бизнес метрики

- Copy ROI vs Wallet ROI: > 70% (мы получаем 70% от доходности whale)
- Slippage: < 5% в среднем
- Win rate копи-сделок: > 50%

---

## Приложения

### A. Пример использования

```bash
# 1. Добавить кошелек для отслеживания
npm run add-wallet 0x1234567890abcdef... "Whale Alpha"

# 2. Проверить текущий watchlist
cat data/wallets.json

# 3. Запустить проверку вручную
npm run check-wallets

# Вывод:
# ════════════════════════════════════════════════════════
# 🔍 Checking 3 wallets for new trades
# ⏰ 12/6/2025, 3:30:00 PM
# ════════════════════════════════════════════════════════
#
# 📊 Whale Alpha (0x1234567...)
#    Found 2 trades in last 10 min
#    New trades: 1
#    ✅ BUY Yes @ 65.0%
#       Will Trump win 2028 election?...
#       Size: $500.00, Confidence: 85%
#
# ✅ Check complete. Generated 1 signals.

# 4. Настроить cron (каждые 5 минут)
crontab -e
# Добавить строку:
# */5 * * * * cd /path/to/polymarket_bot && npm run check-wallets >> logs/copy-trading.log 2>&1

# 5. Посмотреть сигналы
cat data/signals.json
```

### B. Пример сигнала

```json
{
  "id": "sig_1733498400_0x1234",
  "wallet": "0x1234567890abcdef...",
  "action": "FOLLOW",
  "confidence": 0.85,
  "reasons": [
    "Wallet ROI 25% > min 10%",
    "Trade size $500 > min $50"
  ],
  "trade": {
    "conditionId": "0xabc...",
    "question": "Will Trump win 2028 election?",
    "side": "BUY",
    "outcome": "Yes",
    "price": 0.65,
    "size": 769,
    "notional": 500
  },
  "suggestedSize": 50,
  "maxPrice": 0.68,
  "createdAt": "2025-12-06T15:30:00Z"
}
```

### C. Ссылки

- [Polymarket Data API Docs](https://docs.polymarket.com/developers/CLOB/trades/trades-data-api)
- [Real-time Data Client](https://github.com/Polymarket/real-time-data-client)
- [Polymarket Leaderboard](https://polymarket.com/leaderboard)
- [Polywhaler](https://polywhaler.com)
