# Сервисы и модули

Обзор основных сервисов и модулей системы.

## MarketFilter

Переиспользуемый модуль для фильтрации и сортировки рынков.

**Основные возможности:**
- Базовая фильтрация (активность, токены)
- Фильтрация по объему, цене, дате
- Готовые фильтры для стратегий
- Сортировка по различным критериям
- Интеграция с PolymarketDataService

Подробнее: [MarketFilter](market-filter.md)

## PolymarketDataService

Сервис для работы с данными Polymarket API.

**Основные методы:**

```typescript
// Получение обогащенных рынков
getEnrichedMarkets(options: {
  includeOrderbook?: boolean;
  includeLiquidity?: boolean;
}): Promise<EnrichedMarket[]>

// Получение деталей рынка
getMarketDetails(conditionId: string): Promise<EnrichedMarket>

// Получение orderbook
getOrderbook(tokenId: string): Promise<Orderbook>
```

**Использование:**

```typescript
import { PolymarketDataService } from './services/PolymarketDataService';

const dataService = new PolymarketDataService(client);

// Получаем рынки с ликвидностью
const enrichedMarkets = await dataService.getEnrichedMarkets({
  includeOrderbook: true,
  includeLiquidity: true
});
```

## Liquidity Service

Сервис для проверки ликвидности рынков.

**Основные методы:**

```typescript
// Проверка ликвидности токена
checkLiquidity(tokenId: string): Promise<LiquidityMetrics>

// Получение метрик ликвидности
getLiquidityMetrics(orderbook: Orderbook): LiquidityMetrics
```

**Метрики ликвидности:**

- `totalLiquidity` — общая ликвидность ($)
- `bidLiquidity` — ликвидность на покупку
- `askLiquidity` — ликвидность на продажу
- `spread` — спред между bid и ask
- `depth` — глубина orderbook

## AI Services

### AIMarketFilter

AI фильтрация рынков с использованием OpenAI/Gemini.

**Основные методы:**

```typescript
// Анализ рынка через AI
analyzeMarket(market: Market, news?: NewsItem[]): Promise<AIAnalysis>

// Оценка привлекательности
evaluateAttractiveness(market: Market): Promise<number>
```

**Результат анализа:**

```typescript
interface AIAnalysis {
  shouldTrade: boolean;
  attractiveness: number;      // 0-1
  riskLevel: 'low' | 'medium' | 'high';
  aiProbability: number;       // Оценка AI вероятности
  edge: number;                // Разница с рыночной ценой
  reasoning: string;           // Объяснение решения
  newsSummary?: string;        // Резюме новостей
}
```

### SerpAPIService

Сервис для получения новостей через SerpAPI.

**Использование:**

```typescript
import { SerpAPIService } from './services/serp-api.service';

const serpService = new SerpAPIService(process.env.SERP_API_KEY);

// Поиск новостей
const news = await serpService.searchNews(query, {
  timeRange: '24h',
  limit: 5
});
```

### TavilyService

Сервис для глубокого анализа через Tavily.

**Использование:**

```typescript
import { TavilyService } from './services/tavily.service';

const tavilyService = new TavilyService(process.env.TAVILY_API_KEY);

// Глубокий анализ
const analysis = await tavilyService.analyze(query, {
  searchDepth: 'advanced',
  includeAnswer: true
});
```

## Event Agents Services

### BaseEventAgent

Базовый класс для специализированных агентов с MCP интеграцией.

**Основные возможности:**
- Подключение к нескольким MCP серверам одновременно
- Кэширование результатов анализа
- Rate limiting для API запросов
- Автоматический поиск новостей через Tavily

**Доступные агенты:**
- `SportsAgent` - для спортивных рынков
- `PoliticsAgent` - для политических рынков
- `CryptoAgent` - для крипто рынков

Подробнее: [Event Agents](agents.md) и [MCP интеграция](agents-mcp-servers.md)

### MCPRegistry

Централизованный реестр MCP серверов.

**Основные методы:**

```typescript
// Получить доступные серверы
getAvailableServers(): MCPServerConfig[]

// Получить серверы по категории
getServersByCategory(category: MCPCategory): MCPServerConfig[]

// Получить лучший сервер для категории
getBestServerForCategory(category: MCPCategory): MCPServerConfig | null
```

**Поддерживаемые категории:**
- `search` - веб-поиск (Tavily, Brave, Omnisearch)
- `crypto` - крипто данные (CoinGecko, Armor, Bankless)
- `finance` - финансовые данные (Alpha Vantage, Alpaca)
- `web` - веб-скрапинг (Fetch, Playwright, Browserbase)
- `news` - новости (RSS, Tako)

## Copy Trading Services

### WalletMonitor

Мониторинг кошельков для copy trading.

**Основные методы:**

```typescript
// Проверка всех кошельков
checkAllWallets(): Promise<CopySignal[]>

// Проверка одного кошелька
checkWallet(wallet: WatchedWallet): Promise<CopySignal[]>
```

### TradeAnalyzer

Анализ сделок для принятия решений.

**Основные методы:**

```typescript
// Анализ сделки
analyzeTrade(trade: WalletTrade, wallet: WatchedWallet): Promise<AnalysisResult>
```

### SignalEmitter

Генерация и отправка сигналов.

**Основные методы:**

```typescript
// Отправка сигнала
emit(signal: CopySignal): Promise<void>
```

## Database Services

### PostgresAdapter

Адаптер для работы с PostgreSQL.

**Основные методы:**

```typescript
// Сохранение сделки
saveTrade(trade: Trade): Promise<void>

// Получение позиций
getPositions(filters?: PositionFilters): Promise<Position[]>

// Статистика
getStats(days: number): Promise<BotStats>
```

## Utility Services

### TelegramService

Сервис для отправки уведомлений в Telegram.

**Использование:**

```typescript
import { TelegramService } from './services/telegram.service';

const telegram = new TelegramService(
  process.env.TELEGRAM_BOT_TOKEN,
  process.env.TELEGRAM_CHAT_ID
);

// Отправка сообщения
await telegram.sendMessage('Ордер размещен!');
```

### ConfigService

Сервис для работы с конфигурацией.

**Использование:**

```typescript
import { getConfig } from './core/config';

const config = getConfig();
console.log(config.AI_STRATEGY_CONFIG);
```

## Интеграция сервисов

### Пример: Полный pipeline анализа рынка

```typescript
// 1. Получаем рынки
const markets = await client.getSamplingMarkets();

// 2. Обогащаем данными
const dataService = new PolymarketDataService(client);
const enriched = await dataService.getEnrichedMarkets({
  includeOrderbook: true,
  includeLiquidity: true
});

// 3. Фильтруем
const filtered = MarketFilter.filterEnrichedForTrading(
  enriched,
  100,  // minLiquidity
  5,    // maxSpread
  3     // minDepth
);

// 4. AI анализ
const aiFilter = new AIMarketFilter(openaiClient);
for (const market of filtered) {
  const analysis = await aiFilter.analyzeMarket(market);
  if (analysis.shouldTrade) {
    // Генерируем сигнал
  }
}
```

## Тестирование сервисов

```bash
# Тест MarketFilter
npm run test:market-filter

# Тест интеграции MarketFilter + DataService
npm run test:enriched-filter

# Тест AI фильтрации
npm run test:ai-filter

# Тест ликвидности
npm run test:liquidity
```

## Расширение сервисов

Для создания нового сервиса:

1. Создайте файл в `src/services/`
2. Реализуйте необходимые методы
3. Добавьте типы в `src/types/`
4. Напишите тесты в `src/test/`

Пример:

```typescript
// src/services/MyService.ts
export class MyService {
  constructor(private config: MyServiceConfig) {}

  async doSomething(): Promise<Result> {
    // Реализация
  }
}
```

