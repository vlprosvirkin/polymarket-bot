# Руководство для разработчиков

Руководство по разработке и расширению функциональности бота.

## Структура проекта

```
polymarket_bot/
├── src/
│   ├── index.ts                 # Endgame бот
│   ├── bot-ai.ts                # AI бот
│   ├── bot-high-confidence.ts   # High Confidence бот
│   ├── start-api.ts             # REST API сервер
│   │
│   ├── strategies/              # Торговые стратегии
│   │   ├── BaseStrategy.ts      # Базовый класс
│   │   ├── AIStrategy.ts
│   │   ├── EndgameStrategy.ts
│   │   └── HighConfidenceStrategy.ts
│   │
│   ├── agents/                   # Event Agents (MCP интеграция)
│   │   ├── BaseEventAgent.ts     # Базовый класс с MCP
│   │   ├── SportsAgent.ts        # Спортивные рынки
│   │   ├── PoliticsAgent.ts      # Политические рынки
│   │   ├── CryptoAgent.ts        # Крипто рынки
│   │   ├── MCPRegistry.ts        # Реестр MCP серверов
│   │   └── AgentRegistry.ts      # Реестр агентов
│   │
│   ├── adapters/                # Адаптеры для внешних API
│   │   ├── polymarket-data.adapter.ts
│   │   ├── gamma-api.ts
│   │   ├── serp-api.adapter.ts
│   │   ├── tavily.adapter.ts
│   │   └── telegram.adapter.ts
│   │
│   ├── services/                # Сервисы
│   │   ├── PolymarketDataService.ts
│   │   ├── MarketFilter.ts
│   │   └── ai/                  # AI сервисы
│   │
│   ├── api/                     # REST API
│   │   ├── routes/
│   │   └── controllers/
│   │
│   ├── copy-trading/            # Copy Trading
│   │   ├── services/
│   │   ├── storage/
│   │   └── scripts/
│   │
│   ├── database/                # База данных
│   │   ├── PostgresAdapter.ts
│   │   └── migrations/
│   │
│   ├── core/                    # Ядро
│   │   └── config.ts
│   │
│   ├── types/                   # TypeScript типы
│   ├── utils/                   # Утилиты
│   └── test/                    # Тесты
│
├── scripts/                     # Скрипты утилит
├── docs/                        # Документация
└── data/                        # Данные
```

## Команды

### Разработка

```bash
# Компиляция TypeScript
npm run build

# Проверка кода
npm run lint

# Исправление ошибок
npm run lint:fix
```

### Тестирование

```bash
# Тест API подключения
npm run test:api

# Тест ликвидности
npm run test:liquidity

# Тест фильтрации рынков
npm run test:market-filter

# Тест AI фильтрации
npm run test:ai-filter

# Тест MCP реестра
npm run test:mcp
```

### База данных

```bash
# Применить миграции
npm run db:migrate

# Статус миграций
npm run db:status

# Откат миграций
npm run db:rollback
```

## TypeScript правила

### Типы

**НЕ используйте `any`:**

```typescript
// ❌ Плохо
function process(data: any) {
  return data.value;
}

// ✅ Хорошо
function process(data: { value: number }) {
  return data.value;
}
```

### Интерфейсы

Используйте интерфейсы для типов данных:

```typescript
interface Market {
  condition_id: string;
  question: string;
  active: boolean;
  tokens: Token[];
}
```

### Типы для функций

Всегда указывайте типы возвращаемых значений:

```typescript
// ❌ Плохо
function filterMarkets(markets) {
  return markets.filter(...);
}

// ✅ Хорошо
function filterMarkets(markets: Market[]): Market[] {
  return markets.filter(...);
}
```

Подробнее: [Type Optimization](type-optimization.md)

## Создание новой стратегии

### 1. Создайте класс стратегии

```typescript
// src/strategies/MyStrategy.ts
import { BaseStrategy } from './BaseStrategy';
import { Market, TradeSignal, Position } from '../types';

export class MyStrategy extends BaseStrategy {
  name = "My Custom Strategy";

  filterMarkets(markets: Market[]): Market[] {
    // Ваша логика фильтрации
    return markets.filter(market => {
      // Критерии
      return market.active && !market.closed;
    });
  }

  generateSignals(
    market: Market, 
    price: number, 
    position?: Position
  ): TradeSignal[] {
    // Ваша логика генерации сигналов
    const signals: TradeSignal[] = [];
    
    if (price > 0.8 && !position) {
      signals.push({
        market,
        tokenId: market.tokens[0].token_id,
        side: OrderSide.BUY,
        price,
        size: 100,
        reason: 'High probability'
      });
    }
    
    return signals;
  }

  shouldClosePosition(
    market: Market, 
    position: Position, 
    price: number
  ): boolean {
    // Ваша логика закрытия
    return price >= 0.99;
  }
}
```

### 2. Создайте бота

```typescript
// src/bot-my.ts
import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import { MyStrategy } from './strategies/MyStrategy';
import { PolymarketBot } from './PolymarketBot';

async function main() {
  const client = new ClobClient('https://clob.polymarket.com');
  const wallet = new ethers.Wallet(process.env.PK!);
  
  const strategy = new MyStrategy({
    // Конфигурация
  });
  
  const bot = new PolymarketBot(client, wallet, strategy);
  await bot.run();
}

main().catch(console.error);
```

### 3. Добавьте команду в package.json

```json
{
  "scripts": {
    "start:my": "ts-node src/bot-my.ts"
  }
}
```

## Создание нового Event Agent

### 1. Создайте класс агента

```typescript
// src/agents/MyAgent.ts
import { BaseEventAgent, AgentRecommendation, AnalysisContext } from './BaseEventAgent';
import { EnrichedMarket } from '../adapters/polymarket-data.adapter';

export class MyAgent extends BaseEventAgent {
  getCategory(): string {
    return 'my-category';
  }

  getKeywords(): string[] {
    return ['keyword1', 'keyword2', 'keyword3'];
  }

  async analyze(
    market: EnrichedMarket,
    context?: AnalysisContext
  ): Promise<AgentRecommendation> {
    // Ваша логика анализа
    const currentPrice = this.getYesPrice(market);

    // Используем MCP если подключен
    if (this.mcpConnectedSingle) {
      const data = await this.callMCPTool('search', 'brave_search', {
        query: market.question
      });
      // ... анализ данных ...
    }

    return {
      action: 'SKIP',
      confidence: 0.5,
      reasoning: 'My agent analysis',
      sources: []
    };
  }

  // Опционально: инициализация MCP серверов
  async initializeMCPServers(): Promise<string[]> {
    const connected: string[] = [];

    // Подключить рекомендуемые серверы
    if (await this.connectMCP('tavily', 'npx', ['-y', '@anthropic/mcp-server-tavily'])) {
      connected.push('tavily');
    }

    return connected;
  }
}
```

### 2. Зарегистрируйте агента

```typescript
// src/agents/index.ts
import { AgentRegistry } from './AgentRegistry';
import { MyAgent } from './MyAgent';

const registry = new AgentRegistry();
registry.registerAgent(new MyAgent());
```

### 3. Добавьте в MCP Registry (опционально)

```typescript
// src/agents/MCPRegistry.ts
export const AGENT_MCP_CONFIGS: Record<string, string[]> = {
  // ...
  'my-category': ['tavily', 'fetch', 'search']
};
```

Подробнее: [Event Agents](agents.md) и [MCP интеграция](agents-mcp-servers.md)

## Создание нового сервиса

### 1. Создайте класс сервиса

```typescript
// src/services/MyService.ts
export interface MyServiceConfig {
  apiKey: string;
  timeout?: number;
}

export class MyService {
  constructor(private config: MyServiceConfig) {}

  async doSomething(): Promise<Result> {
    // Реализация
  }
}
```

### 2. Добавьте типы

```typescript
// src/types/my-service.ts
export interface Result {
  success: boolean;
  data?: unknown;
  error?: string;
}
```

### 3. Напишите тесты

```typescript
// src/test/test-my-service.ts
import { MyService } from '../services/MyService';

describe('MyService', () => {
  it('should do something', async () => {
    const service = new MyService({ apiKey: 'test' });
    const result = await service.doSomething();
    expect(result.success).toBe(true);
  });
});
```

## Тестирование

### Использование существующих методов

**✅ Правильно:** Используйте реальные методы из кодовой базы:

```typescript
import { MarketFilter } from '../services/MarketFilter';
import { Market } from '../types';

const markets: Market[] = [/* тестовые данные */];
const filtered = MarketFilter.filterBasic(markets);
expect(filtered.length).toBeGreaterThan(0);
```

**❌ Неправильно:** Не переписывайте бизнес-логику в тестах:

```typescript
// ❌ Плохо - дублирование логики
const filtered = markets.filter(m => m.active && !m.closed);
```

### Мокирование внешних зависимостей

Мокируйте только внешние API, не внутреннюю логику:

```typescript
// ✅ Хорошо - мок внешнего API
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
mockedAxios.get.mockResolvedValue({ data: mockData });

// ❌ Плохо - мок внутреннего сервиса
jest.mock('../services/MarketFilter');
```

## Code Style

### Именование

- **Классы**: PascalCase (`MarketFilter`)
- **Функции**: camelCase (`filterMarkets`)
- **Константы**: UPPER_SNAKE_CASE (`MAX_PRICE`)
- **Интерфейсы**: PascalCase с префиксом `I` опционально (`Market` или `IMarket`)

### Форматирование

Используйте ESLint для форматирования:

```bash
npm run lint:fix
```

### Комментарии

Комментируйте сложную логику:

```typescript
// Рассчитываем хедж для защиты от черного лебедя
// Формула: hedgeSize = (mainPositionCost - maxLoss) / (1 - noPrice)
const hedgeSize = Math.ceil(
  (mainPositionCost - maxLoss) / (1 - noPrice)
);
```

## Git Workflow

### Коммиты

Используйте понятные сообщения коммитов:

```bash
git commit -m "feat: add new AI strategy"
git commit -m "fix: resolve liquidity check issue"
git commit -m "docs: update API documentation"
```

### Ветки

- `main` — стабильная версия
- `develop` — разработка
- `feature/*` — новые функции
- `fix/*` — исправления багов

## Деплой

### Локальный запуск

```bash
npm start
```

### Production

См. [GCP Deployment](gcp-deployment.md)

## Отладка

### Логирование

Используйте структурированное логирование:

```typescript
console.log(`[${new Date().toISOString()}] Market filtered: ${markets.length}`);
```

### Отладка в VS Code

Создайте `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Bot",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "start"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

## Best Practices

1. **Используйте TypeScript типы** — избегайте `any`
2. **Пишите тесты** — используйте реальные методы
3. **Следуйте архитектуре** — разделение бот/стратегия
4. **Документируйте код** — комментарии для сложной логики
5. **Используйте существующие сервисы** — не дублируйте код

## Полезные ссылки

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Polymarket CLOB Docs](https://docs.polymarket.com/developers/CLOB/introduction)
- [Model Context Protocol](https://modelcontextprotocol.io) - MCP документация
- [MCP Servers](https://github.com/modelcontextprotocol/servers) - Репозиторий MCP серверов
- [Event Agents](agents.md) - Документация по агентам
- [MCP интеграция](agents-mcp-servers.md) - Документация по MCP
- [Testing Guide](testing-guide.md)

