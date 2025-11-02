# MarketFilter - Модуль фильтрации рынков

Переиспользуемый модуль для фильтрации и сортировки рынков Polymarket.

## Зачем нужен

**Проблема:** Раньше каждая стратегия дублировала логику фильтрации:
- EndgameStrategy: проверяла активность, объем, цену, дату
- AIStrategy: проверяла те же параметры
- BaseStrategy: аналогично

**Решение:** Единый модуль `MarketFilter` с переиспользуемыми методами.

## Использование

### 1. Базовая фильтрация

```typescript
import { MarketFilter } from '../services/MarketFilter';

// Убирает неактивные, закрытые и рынки без токенов
const activeMarkets = MarketFilter.filterBasic(allMarkets);
```

### 2. Фильтрация по параметрам

```typescript
// По объему
const highVolumeMarkets = MarketFilter.filterByVolume(markets, 1000); // Мин $1000

// По цене YES токена
const highProbability = MarketFilter.filterByPrice(markets, 0.80, 0.99); // 80-99%

// По дате разрешения
const endingSoon = MarketFilter.filterByResolutionDate(markets, undefined, 7); // < 7 дней
```

### 3. Комплексная фильтрация

```typescript
const config: MarketFilterConfig = {
    minVolume: 1000,
    minPrice: 0.80,
    maxPrice: 0.99,
    maxDaysToResolution: 14,
    excludeNegRisk: true,
    excludedCategories: ['spam', 'test']
};

const filtered = MarketFilter.filterWithConfig(markets, config);
```

### 4. Готовые фильтры для стратегий

#### Endgame фильтр
```typescript
const endgameMarkets = MarketFilter.filterForEndgame(
    markets,
    0.90,  // minProbability (90%)
    0.99,  // maxProbability (99%)
    14,    // maxDaysToResolution (14 дней)
    0,     // minVolume
    true   // excludeNegRisk
);
```

### 5. Сортировка

```typescript
// По объему (от большего к меньшему)
const sorted = MarketFilter.sortByVolume(markets, true);

// По дате разрешения (ближайшие первые)
const endingSoon = MarketFilter.sortByResolutionDate(markets, true);

// По вероятности (от большей к меньшей)
const highestProb = MarketFilter.sortByProbability(markets, true);

// Умная сортировка для AI (объем + дата + категория)
const aiSorted = MarketFilter.sortForAI(markets, ['sports', 'politics']);
```

### 6. Статистика

```typescript
const stats = MarketFilter.getMarketStats(markets);

console.log(`Всего рынков: ${stats.total}`);
console.log(`Средний объем: $${stats.avgVolume.toFixed(2)}`);
console.log(`Средняя вероятность: ${(stats.avgProbability * 100).toFixed(2)}%`);
console.log(`Среднее время до разрешения: ${stats.avgDaysToResolution.toFixed(1)} дней`);
console.log(`Категории:`, stats.categories);
```

## Интеграция в стратегии

### До (старый код):
```typescript
// EndgameStrategy.ts
filterMarkets(markets: Market[]): Market[] {
    return markets.filter(market => {
        if (!market.active || market.closed || !market.accepting_orders) return false;
        if (!market.tokens || market.tokens.length === 0) return false;

        const volume = parseFloat(market.volume || "0");
        if (volume < this.config.minVolume) return false;

        // ... ещё 30 строк дублирующейся логики
    });
}
```

### После (с MarketFilter):
```typescript
// EndgameStrategy.ts
import { MarketFilter } from '../services/MarketFilter';

filterMarkets(markets: Market[]): Market[] {
    return MarketFilter.filterForEndgame(
        markets,
        this.config.minProbability,
        this.config.maxProbability,
        this.config.maxDaysToResolution,
        this.config.minVolume,
        this.config.excludeNegRisk
    ).slice(0, this.config.maxMarkets);
}
```

**Преимущества:**
- ✅ Меньше кода в стратегиях
- ✅ Единая точка изменений
- ✅ Проще тестировать
- ✅ Легко добавлять новые фильтры

## API Reference

### Методы фильтрации

| Метод | Описание | Параметры |
|-------|----------|-----------|
| `filterBasic()` | Базовая фильтрация (активность, токены) | `markets: Market[]` |
| `filterByVolume()` | Фильтр по объему | `markets, minVolume?, maxVolume?` |
| `filterByPrice()` | Фильтр по цене YES токена | `markets, minPrice?, maxPrice?` |
| `filterByProbability()` | Фильтр по вероятности | `markets, minProbability, maxProbability` |
| `filterByResolutionDate()` | Фильтр по дате разрешения | `markets, minDays?, maxDays?` |
| `filterByCategory()` | Фильтр по категориям | `markets, included?, excluded?` |
| `filterNegRisk()` | Исключить NegRisk | `markets, exclude = true` |
| `filterWithConfig()` | Комплексная фильтрация | `markets, config: MarketFilterConfig` |
| `filterForEndgame()` | Готовый фильтр для Endgame | `markets, minProb, maxProb, maxDays, minVol, excludeNegRisk` |

### Методы сортировки

| Метод | Описание | Параметры |
|-------|----------|-----------|
| `sortByVolume()` | Сортировка по объему | `markets, descending = true` |
| `sortByResolutionDate()` | Сортировка по дате | `markets, nearest = true` |
| `sortByProbability()` | Сортировка по вероятности | `markets, highest = true` |
| `sortForAI()` | Умная сортировка для AI | `markets, preferredCategories?` |

### Утилиты

| Метод | Описание | Возврат |
|-------|----------|---------|
| `getMarketStats()` | Статистика по рынкам | `{ total, avgVolume, avgProbability, avgDaysToResolution, categories }` |

## MarketFilterConfig

```typescript
interface MarketFilterConfig {
    // Базовые фильтры
    minVolume?: number;              // Минимальный объем
    maxVolume?: number;              // Максимальный объем
    minPrice?: number;               // Минимальная цена YES токена
    maxPrice?: number;               // Максимальная цена YES токена
    excludeNegRisk?: boolean;        // Исключить NegRisk рынки

    // Фильтры по времени
    minDaysToResolution?: number;    // Минимум дней до разрешения
    maxDaysToResolution?: number;    // Максимум дней до разрешения

    // Фильтры по категориям
    includedCategories?: string[];   // Только эти категории (whitelist)
    excludedCategories?: string[];   // Исключить эти категории (blacklist)
}
```

## Примеры использования

### Пример 1: Фильтр для высокорисковых рынков
```typescript
const highRiskMarkets = MarketFilter.filterWithConfig(markets, {
    minPrice: 0.01,
    maxPrice: 0.30,
    minVolume: 10000,
    maxDaysToResolution: 7
});
```

### Пример 2: Только спортивные рынки
```typescript
const sportsMarkets = MarketFilter.filterByCategory(
    markets,
    ['sports', 'nba', 'nfl'],  // whitelist
    undefined                   // no blacklist
);
```

### Пример 3: Pipeline фильтрации
```typescript
let filtered = MarketFilter.filterBasic(allMarkets);
filtered = MarketFilter.filterByVolume(filtered, 1000);
filtered = MarketFilter.filterByProbability(filtered, 0.70, 0.95);
filtered = MarketFilter.sortByVolume(filtered, true);
const top10 = filtered.slice(0, 10);
```

### Пример 4: Статистика перед и после
```typescript
console.log('До фильтрации:', MarketFilter.getMarketStats(allMarkets));

const filtered = MarketFilter.filterForEndgame(allMarkets, 0.90, 0.99, 14, 0, true);

console.log('После фильтрации:', MarketFilter.getMarketStats(filtered));
```

## Тестирование

```typescript
import { MarketFilter } from '../services/MarketFilter';

// Тест базовой фильтрации
const markets = await client.getSamplingMarkets();
const active = MarketFilter.filterBasic(markets.data);
console.log(`Активных рынков: ${active.length} из ${markets.data.length}`);

// Тест Endgame фильтра
const endgame = MarketFilter.filterForEndgame(active, 0.90, 0.99, 14);
console.log(`Endgame возможностей: ${endgame.length}`);

// Статистика
const stats = MarketFilter.getMarketStats(endgame);
console.log('Статистика:', stats);
```

## Миграция существующих стратегий

Чтобы использовать `MarketFilter` в существующих стратегиях:

1. Импортируйте модуль:
   ```typescript
   import { MarketFilter } from '../services/MarketFilter';
   ```

2. Замените метод `filterMarkets()`:
   ```typescript
   // Было
   filterMarkets(markets: Market[]): Market[] {
       return markets.filter(market => {
           // 50 строк логики...
       });
   }

   // Стало
   filterMarkets(markets: Market[]): Market[] {
       return MarketFilter.filterForEndgame(
           markets,
           this.config.minProbability,
           this.config.maxProbability,
           this.config.maxDaysToResolution,
           this.config.minVolume,
           this.config.excludeNegRisk
       ).slice(0, this.config.maxMarkets);
   }
   ```

3. Удалите дублирующийся код

## Расширение

Чтобы добавить новый фильтр:

```typescript
// В MarketFilter.ts
static filterByCustomCriteria(markets: Market[], criteria: any): Market[] {
    return markets.filter(market => {
        // Ваша логика
        return true;
    });
}
```

Затем используйте в стратегиях:
```typescript
const filtered = MarketFilter.filterByCustomCriteria(markets, myCriteria);
```

## Интеграция с PolymarketDataService

`MarketFilter` теперь поддерживает работу с обогащенными рынками (`EnrichedMarket`) из `PolymarketDataService`.

### Фильтрация по ликвидности

```typescript
import { PolymarketDataService } from '../services/PolymarketDataService';
import { MarketFilter } from '../services/MarketFilter';

const dataService = new PolymarketDataService(client);

// Получаем рынки с orderbook и метриками ликвидности
const enrichedMarkets = await dataService.getEnrichedMarkets({
    includeOrderbook: true,
    includeLiquidity: true
});

// Фильтруем по минимальной ликвидности ($100)
const liquidMarkets = MarketFilter.filterEnrichedByLiquidity(enrichedMarkets, 100);

// Фильтруем по максимальному спреду (5%)
const tightSpread = MarketFilter.filterEnrichedBySpread(liquidMarkets, 5);

// Фильтруем по глубине orderbook (минимум 3 bid и 3 ask)
const deepOrderbook = MarketFilter.filterEnrichedByOrderbookDepth(tightSpread, 3, 3);
```

### Комплексная фильтрация для торговли

```typescript
// Одна функция для всех проверок ликвидности
const tradableMarkets = MarketFilter.filterEnrichedForTrading(
    enrichedMarkets,
    100,  // minLiquidity ($100)
    5,    // maxSpreadPercent (5%)
    3     // minOrderbookDepth (3 bid/ask orders)
);

console.log(`Найдено ${tradableMarkets.length} ликвидных рынков для торговли`);
```

**Тест интеграции:**
```bash
npm run test:enriched-filter
```

### Статистика по обогащенным рынкам

```typescript
const stats = MarketFilter.getEnrichedMarketStats(enrichedMarkets);

console.log(`Всего рынков: ${stats.total}`);
console.log(`Средняя ликвидность: $${stats.avgLiquidity.toFixed(2)}`);
console.log(`Средний спред: ${stats.avgSpread.toFixed(2)}%`);
console.log(`С orderbook: ${stats.withOrderbook}`);
console.log(`С метриками ликвидности: ${stats.withLiquidity}`);
```

### Пример полного pipeline

```typescript
// 1. Получаем обогащенные рынки
const enrichedMarkets = await dataService.getEnrichedMarkets({
    includeOrderbook: true,
    includeLiquidity: true
});

// 2. Базовая фильтрация (активность, токены)
let filtered = MarketFilter.filterBasic(enrichedMarkets);

// 3. Фильтр по вероятности (Endgame: 90-99%)
filtered = MarketFilter.filterByProbability(filtered, 0.90, 0.99);

// 4. Фильтр по дате разрешения (< 14 дней)
filtered = MarketFilter.filterByResolutionDate(filtered, undefined, 14);

// 5. Фильтр по ликвидности
filtered = MarketFilter.filterEnrichedForTrading(filtered, 100, 5, 3);

// 6. Сортировка по объему
filtered = MarketFilter.sortByVolume(filtered, true);

// 7. Топ-10
const top10 = filtered.slice(0, 10);

console.log(`Финальная выборка: ${top10.length} рынков`);
```

## Методы для EnrichedMarket

| Метод | Описание | Параметры |
|-------|----------|-----------|
| `filterEnrichedByLiquidity()` | Фильтр по минимальной ликвидности | `markets, minLiquidity` |
| `filterEnrichedBySpread()` | Фильтр по максимальному спреду | `markets, maxSpreadPercent` |
| `filterEnrichedByOrderbookDepth()` | Фильтр по глубине orderbook | `markets, minBids, minAsks` |
| `filterEnrichedForTrading()` | Комплексная проверка ликвидности | `markets, minLiquidity?, maxSpread?, minDepth?` |
| `getEnrichedMarketStats()` | Статистика с метриками ликвидности | `markets` |

## Заключение

`MarketFilter` - это **единая точка** для всей логики фильтрации рынков. Используйте его в своих стратегиях для:
- Уменьшения дублирования кода
- Упрощения тестирования
- Единообразия фильтрации
- Легкого добавления новых фильтров
- **Интеграции с PolymarketDataService для проверки ликвидности**
