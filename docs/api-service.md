# PolymarketDataService

Сервис для агрегации данных из Polymarket CLOB API с расчетом ликвидности.

## Назначение

PolymarketDataService решает проблему отсутствия volume/liquidity данных в базовых API endpoints путем:
1. Получения orderbook данных для каждого рынка
2. Расчета реальной ликвидности из bid/ask ордеров
3. Объединения данных из разных API endpoints

## API Endpoints

### 1. getSamplingMarkets()
**Источник:** `ClobClient.getSamplingMarkets()`

**Возвращает:** `PaginationPayload` с массивом `Market[]`

**Поля Market:**
- `condition_id` - ID условия рынка
- `question` - вопрос рынка
- `tokens` - массив токенов (YES/NO) с ценами
- `active`, `closed`, `accepting_orders` - статусы
- `end_date_iso` - дата разрешения
- `neg_risk` - NegRisk рынок
- `volume`, `volume_24hr`, `liquidity` - **ВСЕГДА undefined** ⚠️

**Проблема:** API НЕ возвращает volume/liquidity поля.

**Решение:** Использовать `getOrderBook()` для получения реальной ликвидности.

---

### 2. getOrderBook(tokenId)
**Источник:** `ClobClient.getOrderBook(tokenId)`

**Возвращает:** `OrderBookSummary`

**Поля:**
- `bids` - массив `{ price: string, size: string }`
- `asks` - массив `{ price: string, size: string }`
- `market` - market ID
- `asset_id` - token ID
- `hash` - orderbook hash
- `timestamp` - время обновления

**Использование:** Получение реальной ликвидности и спреда.

**Особенности:**
- `price` в формате 0.0-1.0 (например "0.95")
- `size` в токенах (например "1000.5")
- Ордера отсортированы по цене (best bid/ask первые)

---

### 3. getMarket(conditionId)
**Источник:** `ClobClient.getMarket(conditionId)`

**Возвращает:** `Market`

**Назначение:** Получение детальной информации о конкретном рынке.

**Отличие от getSamplingMarkets:**
- getSamplingMarkets - массив рынков (выборка)
- getMarket - один конкретный рынок по ID

---

## Методы сервиса

### getEnrichedMarkets(params)
**Назначение:** Получение рынков с данными о ликвидности.

**Параметры:**
```typescript
interface GetMarketsParams {
    includeOrderbook?: boolean;    // Добавить orderbook данные
    includeLiquidity?: boolean;    // Рассчитать метрики ликвидности
    minLiquidity?: number;         // Фильтр: минимальная ликвидность
    maxSpread?: number;            // Фильтр: максимальный спред
}
```

**Процесс:**
1. Вызов `getSamplingMarkets()` - получение базовых рынков
2. Для каждого рынка вызов `getOrderBook()` (если `includeOrderbook=true`)
3. Расчет метрик ликвидности из orderbook
4. Фильтрация по `minLiquidity` и `maxSpread`

**Возвращает:** `EnrichedMarket[]`

**Пример:**
```typescript
const markets = await dataService.getEnrichedMarkets({
    includeOrderbook: true,
    includeLiquidity: true,
    minLiquidity: 100,  // минимум $100 ликвидности
    maxSpread: 5        // максимум 5% спред
});
```

---

### getMarketDetails(conditionId)
**Назначение:** Получение детальной информации о конкретном рынке.

**Процесс:**
1. Вызов `getMarket(conditionId)`
2. Вызов `getOrderBook()` для YES токена
3. Расчет метрик ликвидности

**Возвращает:** `EnrichedMarket | null`

**Пример:**
```typescript
const market = await dataService.getMarketDetails("0x123...");
if (market?.liquidityMetrics) {
    console.log(`Liquidity: ${market.liquidityMetrics.totalBidSize + market.liquidityMetrics.totalAskSize}`);
}
```

---

### checkLiquidityBatch(markets, minLiquidity)
**Назначение:** Быстрая проверка ликвидности для списка рынков.

**Параметры:**
- `markets` - массив Market
- `minLiquidity` - минимальная ликвидность (по умолчанию 100)

**Оптимизация:**
- Параллельная обработка батчами по 10 рынков
- Задержка 200ms между батчами (rate limiting)
- Проверка только первых 5 уровней orderbook

**Возвращает:** `Map<conditionId, hasLiquidity>`

**Пример:**
```typescript
const liquidityMap = await dataService.checkLiquidityBatch(markets, 100);
const marketsWithLiq = markets.filter(m =>
    liquidityMap.get(m.condition_id) === true
);
```

---

### getLiquidityStats(markets)
**Назначение:** Статистика по ликвидности рынков.

**Возвращает:**
```typescript
{
    total: number;              // Всего рынков
    withLiquidity: number;      // С ликвидностью
    withoutLiquidity: number;   // Без ликвидности
    avgLiquidity: number;       // TODO: не реализовано
    maxLiquidity: number;       // TODO: не реализовано
}
```

---

## Типы данных

### EnrichedMarket
Расширенный Market с дополнительными данными:

```typescript
interface EnrichedMarket extends Market {
    orderbook?: {
        bids: Array<{ price: string; size: string }>;
        asks: Array<{ price: string; size: string }>;
        spread: number;     // Абсолютный спред (bestAsk - bestBid)
        depth: number;      // Сумма первых 5 уровней bid+ask
    };

    liquidityMetrics?: {
        totalBidSize: number;     // Сумма всех bid ордеров (топ-10)
        totalAskSize: number;     // Сумма всех ask ордеров (топ-10)
        spreadPercent: number;    // Спред в процентах
        hasLiquidity: boolean;    // >= 100 токенов
    };
}
```

---

## Расчеты

### Spread (спред)
```
bestBid = bids[0].price  // Цена покупки YES токена
bestAsk = asks[0].price  // Цена продажи YES токена
spread = bestAsk - bestBid  // Абсолютный спред (0.0-1.0)
spreadPercent = spread * 100  // Спред в процентных пунктах (0-100)
```

**Важно:** Для рынков предсказаний используем абсолютный спред в процентных пунктах, а не процентное отношение к bid. 
Это предотвращает завышение спреда при низких ценах (например, bid=0.1%, ask=99.9% → спред = 99.8 процентных пунктов, а не 99800%).

**Альтернативный расчет** (относительно средней цены):
```
midpoint = (bestBid + bestAsk) / 2
spreadPercent = (spread / midpoint) * 100  // Только если midpoint > 0
```

### Depth (глубина)
```
depth = sum(bids[0..4].size) + sum(asks[0..4].size)
```

### Total Liquidity
```
totalLiquidity = sum(bids[0..9].size) + sum(asks[0..9].size)
```

### hasLiquidity
```
hasLiquidity = totalLiquidity >= 100
```

---

## Производительность

### Время выполнения:
- `getSamplingMarkets()` - ~1-2 секунды
- `getOrderBook()` - ~0.5-1 секунда на рынок
- `getEnrichedMarkets()` с orderbook для 20 рынков - ~15-20 секунд

### Оптимизация:
- Используйте `checkLiquidityBatch()` для быстрой проверки
- Параллельная обработка батчами
- Задержки между батчами для rate limiting
- Проверка только первых 5 уровней для быстроты

---

## Типизация API ответов

### Текущие типы:
✅ `Market` - полностью типизирован (src/types/market.ts)
✅ `OrderBook` - типизирован как `OrderBookSummary`
✅ `SamplingMarketsResponse` - типизирован

### Проблемные методы:
⚠️ `getMarket()` возвращает `any` - использовать как `Market`
⚠️ `getMidpoint()` возвращает `any` - нужен тип
⚠️ `getPrice()` возвращает `any` - нужен тип
⚠️ `getSpread()` возвращает `any` - нужен тип

---

## Примеры использования

### Базовое использование:
```typescript
const client = new ClobClient(API_URL, CHAIN_ID);
const dataService = new PolymarketDataService(client);

// Получение всех рынков с ликвидностью >= $100
const markets = await dataService.getEnrichedMarkets({
    includeOrderbook: true,
    includeLiquidity: true,
    minLiquidity: 100
});
```

### Быстрая проверка:
```typescript
const response = await client.getSamplingMarkets();
const allMarkets = response.data;

const liquidityMap = await dataService.checkLiquidityBatch(allMarkets, 100);
const goodMarkets = allMarkets.filter(m =>
    liquidityMap.get(m.condition_id) === true
);
```

### Детальный анализ:
```typescript
const market = await dataService.getMarketDetails(conditionId);

if (market?.orderbook) {
    console.log(`Best bid: ${market.orderbook.bids[0].price}`);
    console.log(`Best ask: ${market.orderbook.asks[0].price}`);
    console.log(`Spread: ${market.orderbook.spread}`);
}

if (market?.liquidityMetrics) {
    console.log(`Total liquidity: ${
        market.liquidityMetrics.totalBidSize +
        market.liquidityMetrics.totalAskSize
    } tokens`);
}
```

---

## Важные замечания

1. **Volume поля не работают:** API `getSamplingMarkets()` НЕ возвращает `volume`, `volume_24hr`, `liquidity`. Всегда используйте orderbook для ликвидности.

2. **Rate limiting:** API имеет ограничения. Используйте батчинг и задержки.

3. **Только YES токены:** Сервис анализирует orderbook только для YES токенов, так как NO = 1 - YES.

4. **Async операции:** Все методы асинхронные, всегда используйте `await`.

5. **Обработка ошибок:** Методы возвращают `undefined` или `null` при ошибках, всегда проверяйте результат.
