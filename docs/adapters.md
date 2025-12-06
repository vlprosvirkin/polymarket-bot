# Адаптеры (Adapters)

Адаптеры — унифицированный слой для работы с внешними API. Все адаптеры находятся в папке `src/adapters/` и экспортируются через `src/adapters/index.ts`.

## Обзор адаптеров

| Адаптер | API | Назначение | Env переменная |
|---------|-----|------------|----------------|
| `PolymarketDataAdapter` | Polymarket CLOB | Orderbook, ликвидность, рынки | - (использует ClobClient) |
| `GammaApiAdapter` | Gamma Markets API | Информация о рынках, разрешения | - |
| `SerpApiAdapter` | SerpAPI (Google) | Поиск новостей | `SERP_API_KEY` |
| `TavilyAdapter` | Tavily Search | AI-оптимизированный поиск | `TAVILY_API_KEY` |
| `TelegramAdapter` | Telegram Bot API | Уведомления, команды | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |

---

## PolymarketDataAdapter

Адаптер для работы с данными Polymarket через CLOB Client.

### Использование

```typescript
import { ClobClient } from '@polymarket/clob-client';
import { PolymarketDataAdapter } from './adapters';

const client = new ClobClient('https://clob.polymarket.com', 137);
const adapter = new PolymarketDataAdapter(client);

// Получить рынки с ликвидностью
const markets = await adapter.getEnrichedMarkets({
    includeOrderbook: true,
    includeLiquidity: true,
    minLiquidity: 100
});

// Получить детали рынка
const details = await adapter.getMarketDetails(conditionId);

// Получить orderbook для токена
const orderbook = await adapter.getOrderbook(tokenId);

// Получить midpoint цены
const midpoint = await adapter.getMidpoint(tokenId);
```

### Методы

| Метод | Описание |
|-------|----------|
| `getEnrichedMarkets(params)` | Рынки с orderbook и метриками ликвидности |
| `getMarketDetails(conditionId)` | Детальная информация о рынке |
| `checkLiquidityBatch(markets, minLiquidity)` | Проверка ликвидности батчем |
| `getLiquidityStats(markets, minLiquidity)` | Статистика ликвидности |
| `getOrderbook(tokenId)` | Orderbook для токена |
| `getMidpoint(tokenId)` | Midpoint цены |

### Типы

```typescript
interface EnrichedMarket extends Market {
    orderbook?: OrderbookData;
    noOrderbook?: Omit<OrderbookData, 'depth'>;
    liquidityMetrics?: LiquidityMetrics;
}

interface OrderbookData {
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
    spread: number;
    depth: number;
}

interface LiquidityMetrics {
    totalBidSize: number;
    totalAskSize: number;
    spreadPercent: number;
    hasLiquidity: boolean;
    totalMarketLiquidity?: number;
}
```

---

## GammaApiAdapter

Адаптер для Gamma Markets API Polymarket.

### Использование

```typescript
import { GammaApiAdapter } from './adapters';

const gamma = new GammaApiAdapter();

// Получить рынок по condition_id
const market = await gamma.getMarketByConditionId('0x...');

// Получить рынок по token_id
const market = await gamma.getMarketByTokenId('0x...');

// Поиск рынков
const markets = await gamma.searchMarkets({
    question: 'Bitcoin',
    active: true,
    limit: 10
});

// Информация о разрешении
const resolution = await gamma.getMarketResolution(conditionId);
```

### Методы

| Метод | Описание |
|-------|----------|
| `getMarketByConditionId(id)` | Рынок по condition_id |
| `getMarketByTokenId(id)` | Рынок по token_id |
| `searchMarkets(params)` | Поиск рынков |
| `getMarketResolution(id)` | Информация о разрешении |

---

## SerpApiAdapter

Адаптер для SerpAPI (Google Search API).

### Настройка

```bash
# .env
SERP_API_KEY=your_key_here
```

### Использование

```typescript
import { SerpApiAdapter } from './adapters';

const serpApi = new SerpApiAdapter();

// Поиск новостей
const news = await serpApi.searchNews('Bitcoin price', {
    numResults: 10,
    timeRange: 'past_24h'
});

// Поиск информации о событии
const info = await serpApi.searchEventInfo('US Election 2024', {
    numNews: 5
});

// Извлечение ключевых слов
const keywords = serpApi.extractKeywords('Will Bitcoin reach $100k?');

// Форматирование для AI промпта
const formatted = serpApi.formatResultsForPrompt(info);
```

### Методы

| Метод | Описание |
|-------|----------|
| `searchNews(query, options)` | Поиск новостей |
| `searchEventInfo(eventName, options)` | Комплексный поиск о событии |
| `extractKeywords(question)` | Извлечение ключевых слов |
| `formatResultsForPrompt(result)` | Форматирование для AI |

### Типы

```typescript
interface NewsArticle {
    title: string;
    link: string;
    snippet?: string;
    date?: string;
    source?: string;
}

interface SerpSearchOptions {
    location?: string;
    language?: string;
    numResults?: number;
    timeRange?: 'past_24h' | 'past_week' | 'past_month';
}
```

---

## TavilyAdapter

Адаптер для Tavily Search API — специализированного поискового API для AI.

### Настройка

```bash
# .env
TAVILY_API_KEY=your_key_here
```

### Использование

```typescript
import { TavilyAdapter } from './adapters';

const tavily = new TavilyAdapter();

// Базовый поиск
const results = await tavily.search('Bitcoin prediction', {
    maxResults: 5,
    searchDepth: 'basic'
});

// Глубокий поиск (с ответом от Tavily)
const deep = await tavily.deepSearch('US Election polls analysis');

// Быстрый поиск
const quick = await tavily.quickSearch('Lakers game tonight', 5);

// Форматирование для AI промпта
const formatted = tavily.formatResultsForPrompt(results);

// Статистика кэша
const stats = tavily.getCacheStats();
```

### Кэширование

Tavily адаптер имеет встроенное кэширование:
- **TTL:** 1 час
- **Автоочистка:** каждые 15 минут
- **Экономия:** ~$0.02 за повторный запрос

### Методы

| Метод | Описание |
|-------|----------|
| `search(query, options)` | Поиск с опциями |
| `deepSearch(query)` | Глубокий поиск с ответом AI |
| `quickSearch(query, maxResults)` | Быстрый базовый поиск |
| `formatResultsForPrompt(response)` | Форматирование для AI |
| `getCacheStats()` | Статистика кэша |
| `destroy()` | Остановка таймеров кэша |

### Типы

```typescript
interface TavilySearchResult {
    title: string;
    url: string;
    content: string;
    score: number;
    publishedDate?: string;
}

interface TavilySearchResponse {
    query: string;
    responseTime: number;
    results: TavilySearchResult[];
    answer?: string;  // Готовый ответ от Tavily
}

interface TavilySearchOptions {
    maxResults?: number;
    includeAnswer?: boolean;
    searchDepth?: 'basic' | 'advanced';
}
```

---

## TelegramAdapter

Адаптер для Telegram Bot API.

### Настройка

```bash
# .env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=123456789
```

### Использование

```typescript
import { TelegramAdapter } from './adapters';

const telegram = new TelegramAdapter();

// Подключение
await telegram.connect();
console.log(telegram.getBotInfo()); // Информация о боте

// Отправка сообщений
await telegram.sendMessage({
    text: 'Hello!',
    parse_mode: 'HTML'
});

// Отправка фото
await telegram.sendPhoto('https://example.com/image.png', 'Caption');

// Редактирование сообщения
await telegram.editMessageText(messageId, 'Updated text', {
    parse_mode: 'HTML'
});

// Webhook
await telegram.setWebhook('https://your-domain.com/webhook');
const info = await telegram.getWebhookInfo();
await telegram.deleteWebhook();
```

### Методы

| Метод | Описание |
|-------|----------|
| `connect()` | Подключение и проверка токена |
| `disconnect()` | Отключение |
| `isConnected()` | Статус подключения |
| `getBotInfo()` | Информация о боте |
| `sendMessage(message, chatId?)` | Отправка сообщения |
| `sendPhoto(photo, caption?, chatId?)` | Отправка фото |
| `sendDocument(doc, caption?, chatId?)` | Отправка документа |
| `editMessageText(messageId, text, options?)` | Редактирование сообщения |
| `deleteMessage(messageId)` | Удаление сообщения |
| `answerCallbackQuery(id, options?)` | Ответ на callback |
| `setWebhook(url, options?)` | Установка webhook |
| `deleteWebhook()` | Удаление webhook |
| `getWebhookInfo()` | Информация о webhook |

### Типы

```typescript
interface TelegramMessage {
    text: string;
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    disable_web_page_preview?: boolean;
    reply_markup?: {
        inline_keyboard?: Array<Array<{
            text: string;
            callback_data?: string;
            url?: string;
        }>>;
    };
}

interface TelegramBotInfo {
    id: number;
    is_bot: boolean;
    first_name: string;
    username: string;
}
```

---

## Импорт адаптеров

Все адаптеры можно импортировать из единой точки:

```typescript
import {
    // Polymarket
    PolymarketDataAdapter,
    GammaApiAdapter,

    // Search
    SerpApiAdapter,
    TavilyAdapter,

    // Messaging
    TelegramAdapter,

    // Types
    type EnrichedMarket,
    type OrderbookData,
    type LiquidityMetrics,
    type NewsArticle,
    type TavilySearchResult,
    type TelegramMessage
} from './adapters';
```

---

## Тестирование адаптеров

```bash
# Тест Tavily
npm run test:tavily

# Тест Telegram
npm run test:telegram

# Тест ликвидности (PolymarketDataAdapter)
npm run test:liquidity

# Тест обогащенных рынков
npm run test:enriched-filter
```
