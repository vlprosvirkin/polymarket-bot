# Event Agents (Агенты событий)

Специализированные агенты для анализа разных типов рынков на Polymarket.

## Обзор

| Агент | Категория | Описание |
|-------|-----------|----------|
| `SportsAgent` | sports | NBA, NFL, MLB, NHL, Soccer |
| `PoliticsAgent` | politics | Выборы, законодательство, международная политика |
| `CryptoAgent` | crypto | Bitcoin, Ethereum, altcoins, ETF, регуляторика |

## Архитектура

```
BaseEventAgent (абстрактный)
    ├── SportsAgent
    ├── PoliticsAgent
    └── CryptoAgent

MCPRegistry (реестр серверов)
    ├── Search: tavily, brave-search, omnisearch
    ├── Crypto: coingecko, armor-crypto, bankless-onchain
    ├── Finance: alphavantage, alpaca
    ├── Web: fetch, playwright, browserbase
    └── News: rss, tako
```

### BaseEventAgent

Базовый класс предоставляет:
- **MCP интеграция** - подключение к Model Context Protocol серверам
- **MCP Registry** - централизованный реестр 17+ серверов
- **Кэширование** - результаты анализа кэшируются (TTL: 5 минут)
- **Rate limiting** - защита от перегрузки API (30 req/min)
- **Tavily поиск** - автоматический поиск новостей

---

## Использование

### Быстрый старт

```typescript
import { getAgentRegistry } from './agents';

const registry = getAgentRegistry();

// Найти агента для рынка
const agent = registry.getAgentForMarket(market);

if (agent) {
    // Анализ с кэшированием
    const recommendation = await agent.analyzeWithCache(market);

    console.log(recommendation);
    // {
    //   action: 'BUY' | 'SELL' | 'SKIP',
    //   confidence: 0.75,
    //   edge: 0.05,
    //   reasoning: '...',
    //   sources: ['https://...']
    // }
}
```

### Категоризация рынков

```typescript
// Проверка категории
const agent = registry.getAgentForMarket(market);
if (agent) {
    console.log(agent.getCategory()); // 'sports' | 'politics' | 'crypto'
}

// Все категории
console.log(registry.getCategories()); // ['sports', 'politics', 'crypto']
```

### Конфигурация агентов

```typescript
import { SportsAgent, PoliticsAgent, CryptoAgent } from './agents';

// Кастомная конфигурация
const sportsAgent = new SportsAgent({
    minEdge: 0.05,           // Минимальный edge для торговли
    minConfidence: 0.7,      // Минимальная уверенность
    useNewsSearch: true,     // Использовать Tavily для новостей
    maxNewsResults: 5,       // Максимум новостей
    cacheTTL: 5 * 60 * 1000  // Время жизни кэша (5 минут)
});
```

---

## MCP Registry

Централизованный реестр MCP серверов для агентов. Автоматически определяет доступные серверы на основе настроенных API ключей.

### Проверка статуса

```bash
npm run test:mcp
```

### Доступные MCP серверы

| Категория | Сервер | Описание | API ключ |
|-----------|--------|----------|----------|
| **Search** | tavily | AI-оптимизированный поиск | TAVILY_API_KEY |
| | brave-search | Веб, новости, изображения | BRAVE_API_KEY |
| | omnisearch | Unified: Tavily+Brave+Perplexity | опционально |
| | web-search-free | Google без API ключа | 🆓 не нужен |
| **Crypto** | coingecko | 15k+ криптовалют, market cap | 🆓 не нужен |
| | coingecko-pro | Расширенные данные | COINGECKO_PRO_API_KEY |
| | armor-crypto | DeFi, swaps, bridging | 🆓 не нужен |
| | bankless-onchain | Onchain data, ERC20 | 🆓 не нужен |
| **Finance** | alphavantage | Акции, форекс, индикаторы | ALPHAVANTAGE_API_KEY |
| | alpaca | Trading API | ALPACA_API_KEY |
| | tako | Финансы, спорт, погода | 🆓 не нужен |
| **Web** | fetch | Официальный MCP Fetch | 🆓 не нужен |
| | playwright | Microsoft Playwright | 🆓 не нужен |
| | browserbase | Cloud browser | BROWSERBASE_API_KEY |
| | apify | 6000+ скраперов | APIFY_TOKEN |
| **News** | rss | RSS/Atom reader | 🆓 не нужен |
| **AI** | memory | Knowledge graph | 🆓 не нужен |
| | sequential-thinking | Problem solving | 🆓 не нужен |

### Рекомендуемые серверы по агентам

```typescript
// Автоматически используются при initializeRecommendedMCPServers()
AGENT_MCP_CONFIGS = {
    sports: ['tako', 'tavily', 'brave-search', 'web-search-free', 'fetch'],
    politics: ['tavily', 'brave-search', 'rss', 'fetch', 'web-search-free'],
    crypto: ['coingecko', 'tavily', 'armor-crypto', 'alphavantage', 'fetch']
}
```

### Использование MCPRegistry

```typescript
import { getMCPRegistry, getAgentRegistry } from './agents';

// Получить реестр MCP
const mcpRegistry = getMCPRegistry();

// Показать статус всех серверов
mcpRegistry.printStatus();

// Получить доступные серверы (с настроенными API ключами)
const available = mcpRegistry.getAvailableServers();

// Получить серверы по категории
const cryptoServers = mcpRegistry.getServersByCategory('crypto');

// Получить лучший сервер для категории
const bestSearch = mcpRegistry.getBestServerForCategory('search');

// Инициализировать все агенты с MCP
const agentRegistry = getAgentRegistry();
await agentRegistry.initializeMCPServers(2); // Макс 2 сервера на агента
```

---

## MCP Интеграция (расширенная)

Агенты могут подключаться к нескольким MCP серверам одновременно.

### Установка

```bash
npm install @modelcontextprotocol/sdk
```

### Автоматическое подключение (рекомендуется)

```typescript
const agent = new SportsAgent();

// Подключить рекомендуемые серверы для агента
const connected = await agent.initializeRecommendedMCPServers(3);
console.log('Connected:', connected); // ['tako', 'tavily', 'fetch']

// Показать статус
agent.printMCPStatus();
```

### Ручное подключение нескольких серверов

```typescript
const agent = new CryptoAgent();

// Подключить несколько серверов с именами
await agent.connectMCP('coingecko', 'npx', ['-y', '@anthropic/mcp-server-coingecko']);
await agent.connectMCP('search', 'npx', ['-y', '@anthropic/mcp-server-brave-search']);

// Вызвать инструмент на конкретном сервере
const price = await agent.callMCPTool('coingecko', 'get_price', { coin: 'bitcoin' });
const news = await agent.callMCPTool('search', 'brave_search', { query: 'Bitcoin ETF' });

// Список всех инструментов
const tools = await agent.listMCPTools();
// ['coingecko:get_price', 'coingecko:get_market_cap', 'search:brave_search', ...]

// Список подключенных серверов
console.log(agent.getConnectedMCPServers()); // ['coingecko', 'search']

// Отключить конкретный сервер
await agent.disconnectMCP('search');

// Отключить все серверы
await agent.disconnectMCP();
```

### Обратная совместимость

Старый API продолжает работать:

```typescript
// Старый формат (использует имя 'default')
await agent.connectMCP('npx', ['-y', '@anthropic/mcp-server-fetch']);
await agent.callMCPTool('fetch', { url: 'https://...' });
```

---

## CLI команды

### Анализ рынков

```bash
# Статистика по категориям
npm run analyze-markets

# Ограничить количество
npm run analyze-markets -- --limit=50

# Только спортивные рынки
npm run analyze-markets -- --category=sports

# Глубокий анализ с Tavily
npm run analyze-markets -- --limit=10 --analyze
```

### Тестирование

```bash
# Тест агентов
npm run test:agents

# Тест MCP реестра
npm run test:mcp
```

---

## Ключевые слова

### SportsAgent

| Категория | Ключевые слова |
|-----------|----------------|
| Basketball | nba, lakers, celtics, warriors, playoffs, finals, mvp |
| Football | nfl, super bowl, chiefs, eagles, cowboys |
| Baseball | mlb, world series, yankees, dodgers |
| Hockey | nhl, stanley cup, bruins, rangers |
| Soccer | premier league, champions league, messi, ronaldo |

### PoliticsAgent

| Категория | Ключевые слова |
|-----------|----------------|
| US Election | trump, biden, harris, presidential election, democrat, republican |
| US Policy | congress, senate vote, supreme court, legislation |
| International | parliament, prime minister, brexit, european union |

### CryptoAgent

| Категория | Ключевые слова |
|-----------|----------------|
| Bitcoin | bitcoin, btc, halving, lightning network |
| Ethereum | ethereum, eth, vitalik, merge, layer 2 |
| Regulatory | sec, etf, regulation, approve, reject |
| DeFi | defi, uniswap, aave, staking |

---

## AgentRecommendation

Структура рекомендации агента:

```typescript
interface AgentRecommendation {
    action: 'BUY' | 'SELL' | 'SKIP';
    confidence: number;           // 0-1
    reasoning: string;            // Обоснование
    sources: string[];            // URL источников
    estimatedProbability?: number; // Оценка вероятности
    edge?: number;                // Разница с рыночной ценой
    metadata?: Record<string, unknown>;
}
```

### Логика рекомендаций

1. **Категоризация** - определение типа рынка по ключевым словам
2. **Поиск новостей** - запрос в Tavily API
3. **MCP данные** - запрос к подключенным MCP серверам
4. **Применение эвристик** - специфичные для категории правила
5. **Расчет edge** - разница между рыночной ценой и оценкой агента
6. **Формирование рекомендации** - BUY/SELL если edge > minEdge и confidence > minConfidence

---

## Расширение

### Создание нового агента

```typescript
import { BaseEventAgent, AgentRecommendation, AnalysisContext } from './BaseEventAgent';
import { EnrichedMarket } from '../adapters/polymarket-data.adapter';

export class EntertainmentAgent extends BaseEventAgent {

    getCategory(): string {
        return 'entertainment';
    }

    getKeywords(): string[] {
        return ['oscar', 'grammy', 'emmy', 'golden globe', 'movie', 'album'];
    }

    async analyze(
        market: EnrichedMarket,
        context?: AnalysisContext
    ): Promise<AgentRecommendation> {
        // Специфичная логика для entertainment
        const currentPrice = this.getYesPrice(market);

        // Используем MCP если подключен
        if (this.mcpConnectedSingle) {
            const news = await this.callMCPTool('search', 'brave_search', {
                query: market.question
            });
            // ... анализ новостей ...
        }

        return {
            action: 'SKIP',
            confidence: 0.5,
            reasoning: 'Entertainment market analysis',
            sources: []
        };
    }
}
```

### Добавление MCP сервера в реестр

```typescript
// src/agents/MCPRegistry.ts

export const MCP_SERVERS: MCPServerConfig[] = [
    // ... существующие серверы ...

    {
        name: 'entertainment-api',
        description: 'API для данных о развлечениях',
        command: 'npx',
        args: ['-y', '@entertainment/mcp-server'],
        categories: ['data', 'news'],
        requiredEnvVars: ['ENTERTAINMENT_API_KEY'],
        docsUrl: 'https://...',
        isFree: false,
        priority: 80
    }
];

// Добавить в конфиг агента
export const AGENT_MCP_CONFIGS: Record<string, string[]> = {
    // ...
    entertainment: ['entertainment-api', 'tavily', 'fetch']
};
```

### Регистрация агента

```typescript
import { AgentRegistry } from './agents';

const registry = new AgentRegistry();
registry.registerAgent(new EntertainmentAgent());
```

---

## Статистика

Типичное распределение рынков на Polymarket:

| Категория | % рынков |
|-----------|----------|
| Politics | ~40-50% |
| Sports | ~10-15% |
| Crypto | ~5-10% |
| Uncategorized | ~30-40% |

Uncategorized включает: entertainment, tech, weather, science, и другие.

---

## Настройка API ключей

Добавьте в `.env` для разблокировки дополнительных серверов:

```bash
# Поиск (рекомендуется хотя бы один)
TAVILY_API_KEY=...           # https://tavily.com/ (1000 req/месяц бесплатно)
BRAVE_API_KEY=...            # https://brave.com/search/api/ (2000 req/месяц бесплатно)

# Финансы
ALPHAVANTAGE_API_KEY=...     # https://www.alphavantage.co/ (25 req/день бесплатно)
COINGECKO_PRO_API_KEY=...    # https://www.coingecko.com/en/api (платный)

# Веб-скрапинг
BROWSERBASE_API_KEY=...      # https://browserbase.com/
APIFY_TOKEN=...              # https://apify.com/
```
