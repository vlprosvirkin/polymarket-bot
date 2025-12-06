# Дополнительные ресурсы

Полезные ссылки, инструменты и документация.

## Внешние ссылки

### Polymarket

- [Polymarket App](https://polymarket.com) — основное приложение
- [Polymarket CLOB Docs](https://docs.polymarket.com/developers/CLOB/introduction) — документация API
- [CLOB Client GitHub](https://github.com/Polymarket/clob-client) — официальный клиент
- [Polymarket Leaderboard](https://polymarket.com/leaderboard) — топ трейдеров

### Блокчейн

- [Polygon Explorer](https://polygonscan.com) — обозреватель блокчейна
- [Polygon Bridge](https://portal.polygon.technology/polygon/bridge) — мост для токенов
- [Polygon Gas Tracker](https://polygonscan.com/gastracker) — отслеживание газа

### AI и новости

- [OpenAI API Docs](https://platform.openai.com/docs) — документация OpenAI
- [Gemini API Docs](https://ai.google.dev/docs) — документация Gemini
- [SerpAPI Docs](https://serpapi.com/search-api) — документация SerpAPI
- [Tavily Docs](https://docs.tavily.com) — документация Tavily

### Model Context Protocol (MCP)

- [MCP Documentation](https://modelcontextprotocol.io) — официальная документация MCP
- [MCP Servers](https://github.com/modelcontextprotocol/servers) — репозиторий MCP серверов
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) — TypeScript SDK
- [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers) — список MCP серверов

### Copy Trading

- [Polywhaler](https://polywhaler.com) — отслеживание китов
- [Polymarket Tracker](https://polymarket-tracker.com) — трекер активности

## Полезные инструменты

### Разработка

- [TypeScript Handbook](https://www.typescriptlang.org/docs/) — руководство TypeScript
- [Node.js Docs](https://nodejs.org/docs) — документация Node.js
- [PostgreSQL Docs](https://www.postgresql.org/docs/) — документация PostgreSQL

### Тестирование

- [Jest Docs](https://jestjs.io/docs/getting-started) — документация Jest
- [Playwright Docs](https://playwright.dev) — документация Playwright

### Деплой

- [GCP Docs](https://cloud.google.com/docs) — документация Google Cloud
- [Docker Docs](https://docs.docker.com) — документация Docker

## Сообщество

### GitHub

- [Репозиторий проекта](https://github.com/vlprosvirkin/polymarket-bot)
- [Issues](https://github.com/vlprosvirkin/polymarket-bot/issues) — баг-репорты и предложения
- [Discussions](https://github.com/vlprosvirkin/polymarket-bot/discussions) — обсуждения

### Telegram

- [Polymarket Community](https://t.me/polymarket) — официальное сообщество

## Образовательные ресурсы

### Prediction Markets

- [Polymarket Academy](https://polymarket.com/academy) — обучение торговле
- [Augur Docs](https://docs.augur.net) — документация Augur (похожая платформа)

### Торговля

- [Trading Basics](https://www.investopedia.com/trading) — основы торговли
- [Risk Management](https://www.investopedia.com/articles/trading/09/risk-management.asp) — управление рисками

## API Reference

### Polymarket CLOB API

**Base URL:** `https://clob.polymarket.com`

**Основные endpoints:**

- `GET /markets` — список рынков
- `GET /markets/:id` — детали рынка
- `GET /orderbook/:token` — orderbook токена
- `POST /orders` — размещение ордера
- `GET /trades` — история сделок

### REST API проекта

**Base URL:** `http://localhost:3001`

**Документация:** `http://localhost:3001/api-docs` (Swagger UI)

## Примеры кода

### Базовый пример бота

```typescript
import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import { EndgameStrategy } from './strategies/EndgameStrategy';

const client = new ClobClient('https://clob.polymarket.com');
const wallet = new ethers.Wallet(process.env.PK!);
const strategy = new EndgameStrategy(config);

// Получаем рынки
const markets = await client.getSamplingMarkets();

// Фильтруем
const filtered = strategy.filterMarkets(markets.data);

// Генерируем сигналы
for (const market of filtered) {
  const price = await client.getMidpoint(market.tokens[0].token_id);
  const signals = strategy.generateSignals(market, price);
  
  // Исполняем сигналы
  for (const signal of signals) {
    await client.createAndPostOrder({
      tokenId: signal.tokenId,
      side: signal.side,
      price: signal.price,
      size: signal.size
    });
  }
}
```

### Использование MarketFilter

```typescript
import { MarketFilter } from './services/MarketFilter';

// Базовая фильтрация
const active = MarketFilter.filterBasic(markets);

// Фильтр по вероятности
const highProb = MarketFilter.filterByProbability(active, 0.90, 0.99);

// Сортировка
const sorted = MarketFilter.sortByVolume(highProb, true);
```

### Использование AI

```typescript
import { AIMarketFilter } from './services/ai/ai-market-filter';

const aiFilter = new AIMarketFilter(openaiClient);

const analysis = await aiFilter.analyzeMarket(market, news);

if (analysis.shouldTrade && analysis.edge > 0.10) {
  // Торговать
}
```

## FAQ

### Как начать торговлю?

См. [Быстрый старт](getting-started.md)

### Какая стратегия лучше?

Зависит от вашего опыта и целей. См. [Стратегии](strategies.md)

### Как настроить AI?

См. [AI Strategy](ai-usage.md)

### Как работает хеджирование?

См. [Endgame Strategy](endgame-strategy.md)

### Как отслеживать позиции?

Используйте REST API или Telegram. См. [API](api.md) и [Telegram Integration](telegram-integration.md)

## Лицензия

ISC License

## Контакты

- GitHub: [@vlprosvirkin](https://github.com/vlprosvirkin)
- Issues: [GitHub Issues](https://github.com/vlprosvirkin/polymarket-bot/issues)

