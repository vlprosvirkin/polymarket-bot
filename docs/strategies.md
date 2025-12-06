# Стратегии торговли

Polymarket Trading Bot поддерживает несколько торговых стратегий. Каждая стратегия имеет свои особенности и подходит для разных сценариев.

## Обзор стратегий

| Стратегия | Команда | Описание | Риск | Доходность |
|-----------|---------|----------|------|------------|
| **Endgame** | `npm start` | Хедж для 95-99% рынков | Низкий | 1-5% за сделку |
| **AI Strategy** | `npm run start:ai` | AI анализ с новостями | Средний | 5-15% за сделку |
| **High Confidence** | `npm run start:high` | Упрощенная для 80%+ | Средний-Высокий | 3-10% за сделку |

## Endgame Strategy

Хедж-стратегия для рынков с высокой вероятностью, близких к разрешению.

**Подходит для:**
- Рынков с вероятностью 95-99%
- Событий с четкой датой разрешения
- Консервативных трейдеров

**Особенности:**
- Автоматический хедж от "черного лебедя"
- Ограничение максимального убытка
- Ранний выход при достижении 99%

Подробнее: [Endgame Strategy](endgame-strategy.md)

## AI Strategy

AI-powered стратегия с использованием OpenAI/Gemini для анализа рынков.

**Подходит для:**
- Рынков с неопределенным исходом
- Событий с доступными новостями
- Трейдеров, готовых платить за AI анализ

**Особенности:**
- Анализ новостей через SerpAPI/Tavily
- Оценка вероятности через AI
- Расчет edge (разница между AI оценкой и ценой)
- Контроль бюджета на AI запросы

Подробнее: [AI Strategy](ai-usage.md)

## High Confidence Strategy

Упрощенная стратегия для рынков с высокой уверенностью.

**Подходит для:**
- Рынков с вероятностью 80%+
- Быстрых сделок
- Опытных трейдеров

**Особенности:**
- Минимальная фильтрация
- Быстрое принятие решений
- Без хеджирования

## Base Strategy

Базовый класс для всех стратегий. Определяет интерфейс:

```typescript
interface IStrategy {
  filterMarkets(markets: Market[]): Market[];
  generateSignals(market: Market, price: number, position?: Position): TradeSignal[];
  shouldClosePosition(market: Market, position: Position, price: number): boolean;
}
```

**Методы:**

- `filterMarkets()` — фильтрация рынков по критериям стратегии
- `generateSignals()` — генерация торговых сигналов
- `shouldClosePosition()` — логика закрытия позиций

## Выбор стратегии

### Для начинающих

**Рекомендуется: Endgame Strategy**

- Низкий риск благодаря хеджированию
- Понятная логика работы
- Защита от больших убытков

### Для опытных трейдеров

**Рекомендуется: AI Strategy**

- Использование AI для поиска edge
- Анализ новостей в реальном времени
- Гибкая настройка параметров

### Для быстрой торговли

**Рекомендуется: High Confidence**

- Минимальная задержка
- Простая логика
- Быстрое исполнение

## Конфигурация стратегий

Все стратегии настраиваются через `src/core/config.ts`:

```typescript
// Endgame конфигурация
EndgameConfig = {
  minProbability: 0.95,
  maxProbability: 0.99,
  maxDaysToResolution: 14,
  maxAcceptableLoss: 0.20,
  // ...
}

// AI конфигурация
AI_STRATEGY_CONFIG = {
  MIN_PRICE: 0.05,
  MAX_PRICE: 0.75,
  MIN_AI_ATTRACTIVENESS: 0.6,
  MAX_AI_BUDGET_PER_DAY: 5.0,
  // ...
}
```

## Создание собственной стратегии

Вы можете создать свою стратегию, наследуясь от `BaseStrategy`:

```typescript
import { BaseStrategy } from './BaseStrategy';
import { Market, TradeSignal, Position } from '../types';

export class MyCustomStrategy extends BaseStrategy {
  name = "My Custom Strategy";

  filterMarkets(markets: Market[]): Market[] {
    // Ваша логика фильтрации
    return markets.filter(market => {
      // Критерии отбора
      return true;
    });
  }

  generateSignals(market: Market, price: number, position?: Position): TradeSignal[] {
    // Ваша логика генерации сигналов
    return [];
  }

  shouldClosePosition(market: Market, position: Position, price: number): boolean {
    // Ваша логика закрытия
    return false;
  }
}
```

Затем используйте её в боте:

```typescript
const strategy = new MyCustomStrategy(config);
const bot = new PolymarketBot(client, wallet, strategy);
```

## Сравнение стратегий

### Риск vs Доходность

```
High Risk, High Reward
    ↑
    │  AI Strategy
    │
    │  High Confidence
    │
    │  Endgame Strategy
    └──────────────────→
    Low Risk, Low Reward
```

### Время до разрешения

- **Endgame**: < 14 дней
- **AI Strategy**: Любое
- **High Confidence**: Любое

### Требования к капиталу

- **Endgame**: Средний (нужен хедж)
- **AI Strategy**: Средний (оплата AI)
- **High Confidence**: Низкий

## Мониторинг стратегий

Используйте REST API для мониторинга:

```bash
# Статистика по стратегиям
curl http://localhost:3001/api/positions/db/stats?strategy=endgame

# Сигналы от AI
curl http://localhost:3001/api/positions/db/signals?source=ai
```

## Best Practices

1. **Начните с Endgame** — самая безопасная стратегия
2. **Тестируйте на малых суммах** — проверьте работу перед увеличением капитала
3. **Мониторьте результаты** — используйте API для отслеживания
4. **Настройте параметры** — адаптируйте под свой стиль торговли
5. **Используйте несколько стратегий** — диверсифицируйте подход

