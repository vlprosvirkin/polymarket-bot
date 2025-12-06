# Агенты и MCP серверы

## Обзор

Агенты теперь могут подключаться к **нескольким MCP серверам одновременно**, что позволяет им получать данные из разных источников для разных категорий (спорт, политика, крипто, рынки).

## Что изменилось

### До изменений
- Каждый агент мог подключиться только к **одному** MCP серверу
- Не было возможности использовать разные источники данных для разных категорий

### После изменений
- ✅ Агенты могут подключаться к **нескольким MCP серверам** одновременно
- ✅ Каждый сервер имеет **уникальное имя** (например, 'sports', 'politics', 'crypto')
- ✅ Можно вызывать инструменты на конкретном сервере по имени
- ✅ Обратная совместимость: старый API продолжает работать

## Использование

### 1. Подключение к нескольким MCP серверам

```typescript
import { SportsAgent } from './agents/SportsAgent';

const agent = new SportsAgent();

// Подключаем спортивный MCP сервер
await agent.connectMCP('sports', 'npx', [
    '-y',
    '@sports-api/mcp-server'
]);

// Подключаем поисковый MCP сервер для новостей
await agent.connectMCP('search', 'npx', [
    '-y',
    '@anthropic/mcp-server-brave-search'
]);

// Подключаем статистический MCP сервер
await agent.connectMCP('stats', 'npx', [
    '-y',
    '@stats-api/mcp-server'
]);

// Проверяем подключенные серверы
const servers = agent.getConnectedMCPServers();
console.log('Подключенные серверы:', servers);
// Output: ['sports', 'search', 'stats']
```

### 2. Вызов инструментов на конкретном сервере

```typescript
// Вызов инструмента на сервере 'sports'
const teamStats = await agent.callMCPTool('sports', 'get_team_stats', {
    team: 'Lakers',
    league: 'NBA'
});

// Вызов инструмента на сервере 'search'
const searchResults = await agent.callMCPTool('search', 'brave_search', {
    query: 'Lakers vs Warriors',
    count: 5
});

// Вызов инструмента на сервере 'stats'
const playerStats = await agent.callMCPTool('stats', 'get_player_stats', {
    player: 'LeBron James',
    season: '2024'
});
```

### 3. Обратная совместимость

Старый API продолжает работать:

```typescript
// Старый формат (без имени сервера)
await agent.connectMCP('npx', ['-y', '@anthropic/mcp-server-brave-search']);

// Вызов без указания сервера (используется первый подключенный)
const result = await agent.callMCPTool('search', { query: 'test' });
```

### 4. Получение списка инструментов

```typescript
// Инструменты конкретного сервера
const sportsTools = await agent.listMCPTools('sports');
console.log('Sports tools:', sportsTools);
// Output: ['get_team_stats', 'get_player_stats', 'get_game_schedule']

// Инструменты всех серверов
const allTools = await agent.listMCPTools();
console.log('All tools:', allTools);
// Output: ['sports:get_team_stats', 'search:brave_search', 'stats:get_player_stats']
```

### 5. Отключение от серверов

```typescript
// Отключение от конкретного сервера
await agent.disconnectMCP('sports');

// Отключение от всех серверов
await agent.disconnectMCP();
```

## Примеры для разных агентов

### SportsAgent

```typescript
import { SportsAgent } from './agents/SportsAgent';

const sportsAgent = new SportsAgent();

// Инициализация MCP серверов
await sportsAgent.initializeMCPServers();

// Или вручную:
await sportsAgent.connectMCP('sports', 'npx', ['-y', '@sports-api/mcp-server']);
await sportsAgent.connectMCP('search', 'npx', ['-y', '@anthropic/mcp-server-brave-search']);

// Анализ рынка автоматически использует MCP данные
const recommendation = await sportsAgent.analyzeWithCache(market);
```

### PoliticsAgent

```typescript
import { PoliticsAgent } from './agents/PoliticsAgent';

const politicsAgent = new PoliticsAgent();

// Подключаем политические MCP серверы
await politicsAgent.connectMCP('polls', 'npx', ['-y', '@polls-api/mcp-server']);
await politicsAgent.connectMCP('news', 'npx', ['-y', '@news-api/mcp-server']);

// Получаем данные опросов
const pollData = await politicsAgent.callMCPTool('polls', 'get_election_polls', {
    candidate: 'Biden',
    state: 'Pennsylvania'
});
```

### CryptoAgent

```typescript
import { CryptoAgent } from './agents/CryptoAgent';

const cryptoAgent = new CryptoAgent();

// Подключаем крипто MCP серверы
await cryptoAgent.connectMCP('crypto', 'npx', ['-y', '@crypto-api/mcp-server']);
await cryptoAgent.connectMCP('price', 'npx', ['-y', '@price-api/mcp-server']);

// Получаем цену Bitcoin
const btcPrice = await cryptoAgent.callMCPTool('price', 'get_crypto_price', {
    symbol: 'BTC',
    currency: 'USD'
});
```

## Структура MCP клиентов

Внутри `BaseEventAgent`:

```typescript
// Map с несколькими клиентами
protected mcpClients: Map<string, unknown> = new Map();

// Set с именами подключенных серверов
protected mcpConnected: Set<string> = new Set();
```

## API Reference

### `connectMCP(serverName, serverCommand, args)`

Подключение к MCP серверу с именем.

**Параметры:**
- `serverName` (string) - Уникальное имя сервера
- `serverCommand` (string) - Команда для запуска (например, 'npx')
- `args` (string[]) - Аргументы команды

**Возвращает:** `Promise<boolean>`

**Пример:**
```typescript
await agent.connectMCP('sports', 'npx', ['-y', '@sports-api/mcp-server']);
```

### `callMCPTool(serverName, toolName, args)`

Вызов инструмента на конкретном MCP сервере.

**Параметры:**
- `serverName` (string) - Имя сервера
- `toolName` (string) - Имя инструмента
- `args` (Record<string, unknown>) - Аргументы инструмента

**Возвращает:** `Promise<MCPToolResult | null>`

**Пример:**
```typescript
const result = await agent.callMCPTool('sports', 'get_team_stats', {
    team: 'Lakers',
    league: 'NBA'
});
```

### `listMCPTools(serverName?)`

Получение списка доступных инструментов.

**Параметры:**
- `serverName` (string, optional) - Имя сервера (если не указано, возвращает все)

**Возвращает:** `Promise<string[]>`

**Пример:**
```typescript
const tools = await agent.listMCPTools('sports');
// Output: ['get_team_stats', 'get_player_stats']
```

### `getConnectedMCPServers()`

Получение списка подключенных серверов.

**Возвращает:** `string[]`

**Пример:**
```typescript
const servers = agent.getConnectedMCPServers();
// Output: ['sports', 'search', 'stats']
```

### `disconnectMCP(serverName?)`

Отключение от MCP сервера.

**Параметры:**
- `serverName` (string, optional) - Имя сервера (если не указано, отключает все)

**Пример:**
```typescript
await agent.disconnectMCP('sports'); // Отключить конкретный
await agent.disconnectMCP(); // Отключить все
```

## Рекомендации

1. **Используйте осмысленные имена** для MCP серверов:
   - ✅ `'sports'`, `'politics'`, `'crypto'`
   - ❌ `'server1'`, `'server2'`, `'test'`

2. **Инициализируйте серверы в конструкторе или методе `initialize()`**:
   ```typescript
   async initialize(): Promise<void> {
       await this.connectMCP('sports', 'npx', ['-y', '@sports-api/mcp-server']);
       await this.connectMCP('search', 'npx', ['-y', '@anthropic/mcp-server-brave-search']);
   }
   ```

3. **Обрабатывайте ошибки подключения**:
   ```typescript
   const connected = await agent.connectMCP('sports', 'npx', ['-y', '@sports-api/mcp-server']);
   if (!connected) {
       console.warn('Failed to connect to sports MCP server');
   }
   ```

4. **Используйте try-catch при вызове инструментов**:
   ```typescript
   try {
       const result = await agent.callMCPTool('sports', 'get_team_stats', { team: 'Lakers' });
       // Используем результат
   } catch (error) {
       console.error('MCP tool call failed:', error);
       // Fallback логика
   }
   ```

## Примеры MCP серверов

### Спортивные данные
- `@sports-api/mcp-server` - Статистика команд и игроков
- `@espn-api/mcp-server` - Данные ESPN
- `@nba-api/mcp-server` - NBA статистика

### Политические данные
- `@polls-api/mcp-server` - Опросы общественного мнения
- `@election-api/mcp-server` - Данные о выборах
- `@congress-api/mcp-server` - Данные Конгресса

### Крипто данные
- `@crypto-api/mcp-server` - Цены и данные криптовалют
- `@defi-api/mcp-server` - DeFi протоколы
- `@blockchain-api/mcp-server` - Блокчейн данные

### Поиск и новости
- `@anthropic/mcp-server-brave-search` - Поиск через Brave
- `@news-api/mcp-server` - Новостные источники
- `@social-api/mcp-server` - Социальные сети

## Установка MCP SDK

Для использования MCP серверов необходимо установить SDK:

```bash
npm install @modelcontextprotocol/sdk
```

## Troubleshooting

### Ошибка: "MCP SDK not installed"
**Решение:** Установите SDK: `npm install @modelcontextprotocol/sdk`

### Ошибка: "MCP server already connected"
**Решение:** Сервер с таким именем уже подключен. Используйте другое имя или отключите существующий.

### Ошибка: "MCP tool call failed"
**Решение:** 
1. Проверьте, что сервер подключен: `agent.getConnectedMCPServers()`
2. Проверьте, что инструмент существует: `agent.listMCPTools('serverName')`
3. Проверьте правильность аргументов инструмента

