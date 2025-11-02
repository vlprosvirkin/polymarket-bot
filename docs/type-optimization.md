# Оптимизация типов

## Удаление неиспользуемых полей

### Volume
- ✅ Удален `minVolume`/`maxVolume` из `MarketFilterConfig`
- ✅ Удален `minVolume` из `StrategyConfig`
- ✅ Удалены методы `filterByVolume()` и `sortByVolume()` из `MarketFilter`
- ✅ `Market.volume` оставлен как опциональное поле (может быть полезен в будущем, но не используется)

### Причина
API Polymarket не возвращает поле `volume` в ответах `getSamplingMarkets()`. Всегда `undefined` или `0`.

**Решение для проверки ликвидности:**
Используйте `PolymarketDataService` + `MarketFilter.filterEnrichedForTrading()` для проверки реальной ликвидности из orderbook.

## Дублирование типов

### OrderSide
- ✅ Наш `OrderSide` enum (в `src/types/market.ts`) - используется для внутренней логики
- ✅ `Side` enum из `@polymarket/clob-client` - используется для API вызовов
- **Статус:** Оптимизировано - используется конвертация между ними при необходимости

### OpenOrder
- ✅ Наш `OpenOrder` interface (в `src/types/market.ts`) - определен для документирования
- ✅ `OpenOrder` из `@polymarket/clob-client` - используется в `index.ts` (тип из библиотеки)
- **Статус:** Оптимизировано - используем тип из библиотеки где это возможно

### Типы для AI ответов
- ✅ `AIMarketAnalysisJSON` - типизирует JSON от AI для анализа рынка
- ✅ `AIMarketScoreJSON` - типизирует JSON от AI для scoring
- **Статус:** Оптимизировано - разделены по назначению

## Рекомендации

1. **Для проверки ликвидности:**
   ```typescript
   // ❌ Не использовать (volume не работает)
   if (market.volume && market.volume > minVolume) { ... }
   
   // ✅ Правильно (использовать orderbook)
   const enriched = await dataService.getMarketDetails(market.condition_id);
   const liquid = MarketFilter.filterEnrichedForTrading([enriched], minLiquidity);
   ```

2. **Для типов:**
   - Используйте типы из `@polymarket/clob-client` для API взаимодействия
   - Используйте наши типы для внутренней бизнес-логики
   - Конвертируйте между ними при необходимости

3. **Структура типов:**
   - `src/types/market.ts` - типы рынков, ордеров, сделок
   - `src/types/strategy.ts` - типы стратегий
   - `src/types/ai-response.ts` - типы для AI ответов
   - `src/types/api-responses.ts` - типы для внешних API (SerpAPI, Tavily)

