# AI Strategy Roadmap & Deep Research

> **Дата:** 2025-11-04
> **Статус:** AI стратегия на 85% готова, требуется 15% доработок для production

---

## 📊 Executive Summary

AI Strategy в polymarket_bot - **хорошо продуманная система** с 7-уровневой фильтрацией, edge detection и управлением бюджетом. Реализовано ~1,817 строк кода.

**Что работает:**
- ✅ Полная интеграция OpenAI/Gemini + SerpAPI + Tavily
- ✅ Edge detection на основе AI estimatedProbability
- ✅ Управление бюджетом ($5/день, $0.50/цикл)
- ✅ Двухэтапный анализ (быстрый → глубокий)

**Что нужно исправить:**
- ❌ estimatedProbability может отсутствовать (критично для edge)
- ❌ Параллельный анализ может превысить rate limit
- ❌ Нет P&L tracking по источнику (AI vs baseline)
- ❌ Простой расчет размера ордера

---

## 🎯 Roadmap по приоритетам

### Phase 1: Критические исправления (P0) 🔥

**Deadline:** 1-2 дня | **Impact:** Critical

#### 1.1 Гарантировать estimatedProbability в AI ответе
**Проблема:** Edge detection не работает без estimatedProbability
```typescript
// ТЕКУЩЕЕ: AI может не вернуть estimatedProbability
if (analysis.estimatedProbability !== undefined) {
    edge = Math.abs(analysis.estimatedProbability - currentPrice);
} else {
    // Edge detection пропущен! ❌
}
```

**Решение:**
- [ ] Усилить промпт с явным требованием
- [ ] Добавить валидацию ответа
- [ ] Fallback: использовать market price если AI не вернул
- [ ] Логировать случаи отсутствия estimatedProbability

**Файлы:** `ai-market-filter.ts` (строки 451-557)

---

#### 1.2 Rate limiting для OpenAI API
**Проблема:** Параллельный анализ 100 рынков = 100 запросов за 5 сек → 429 errors

**Решение:**
- [ ] Создать RequestQueue с maxConcurrent=3
- [ ] Delay 100-200ms между запросами
- [ ] Retry с exponential backoff для 429 errors
- [ ] Логирование rate limit hits

**Файлы:** Новый `request-queue.ts`, `ai-market-filter.ts`

**Метрики:**
- Before: 100 requests за 5 сек → 429 errors
- After: 100 requests за ~33 сек → 0 errors

---

#### 1.3 Валидация логики AI ответа
**Проблема:** AI может вернуть противоречивые данные
```typescript
{
  "recommendedAction": "BUY_YES",
  "estimatedProbability": 0.30  // Но рынок 0.80! ❌
}
```

**Решение:**
- [ ] Проверка: если BUY_YES, то estimatedProbability > market price
- [ ] Проверка: если BUY_NO, то estimatedProbability < market price
- [ ] Проверка: attractiveness согласуется с edge
- [ ] Fallback: recommendedAction = 'AVOID' при противоречиях

**Файлы:** `ai-market-filter.ts` (normalizeAnalysis)

---

### Phase 2: Важные фичи (P1) 🚀

**Deadline:** 3-5 дней | **Impact:** High

#### 2.1 P&L Tracking по источнику анализа
**Цель:** Понять эффективность AI vs baseline

**Фичи:**
- [ ] Создать AnalyticsService
- [ ] Трек каждого trade с метаданными:
  - sourceType: 'AI' | 'BASIC' | 'ENDGAME'
  - confidence, attractiveness, edge
  - executedPrice, currentPrice, pnl
- [ ] Метрики:
  - Win Rate (AI) vs Win Rate (baseline)
  - Avg Return (AI) vs Avg Return (baseline)
  - Alpha = Return(AI) - Return(baseline)
- [ ] Dashboard с реал-тайм статистикой
- [ ] Экспорт в CSV/JSON

**Файлы:** Новый `analytics.service.ts`, `bot-ai.ts`

**KPI:**
- Target Win Rate (AI): > 55%
- Target Alpha (AI - baseline): > 3%

---

#### 2.2 Динамический размер позиции
**Проблема:** Текущий расчет слишком простой
```typescript
const size = orderSize * (1 + attractiveness);  // 1-2x
```

**Решение:** Multi-factor sizing
```typescript
size = baseSize
     * attractiveness_mult     // 1-2x
     * risk_mult               // 0.5-1.5x (low=1.5, high=0.5)
     * confidence_mult         // 0.5-1.5x
     * edge_mult               // 1-2x (больше edge = больше size)

// Ограничения:
// - Min: $10
// - Max: $1000 или 10% портфеля
```

**Файлы:** `AIStrategy.ts` (calculateOrderSize)

**Метрики:**
- Before: Fixed 1-2x multiplier
- After: Dynamic 0.5-6x multiplier (с ограничениями)

---

#### 2.3 Кэширование Tavily результатов
**Проблема:** Дублирующиеся Tavily запросы = $0.02 потрачено впустую

**Решение:**
- [ ] Map<query, {response, timestamp}>
- [ ] TTL = 1 час (рынки медленно меняются)
- [ ] Очистка старых записей
- [ ] Логирование cache hits/misses

**Файлы:** `tavily.service.ts`

**Метрики:**
- Before: 10 Tavily requests = $0.20
- After: 10 requests, 7 cache hits = $0.06 (сэкономлено 70%)

---

#### 2.4 Retry логика для AI анализа
**Проблема:** Временная ошибка OpenAI → пропущен весь анализ

**Решение:**
- [ ] Exponential backoff: 1s, 2s, 4s
- [ ] Max retries = 3
- [ ] Fallback на базовую фильтрацию после 3 неудач
- [ ] Логирование ошибок

**Файлы:** `AIStrategy.ts` (asyncFilterMarkets)

---

### Phase 3: Улучшения качества (P2) 💎

**Deadline:** 1-2 недели | **Impact:** Medium

#### 3.1 Portfolio correlation check
**Проблема:** Может открыть 5 коррелированных позиций (все про Bitcoin)

**Решение:**
- [ ] Категоризация рынков по темам
- [ ] Расчет корреляции между открытыми позициями
- [ ] Лимит на категорию: max 30% портфеля
- [ ] Предупреждение о высокой корреляции

**Файлы:** Новый `portfolio-manager.ts`

**Пример:**
```
Bitcoin ETF: $500
Bitcoin price > $100k: $300
Bitcoin regulation: $200
→ Total Bitcoin exposure: $1000 (50%) ⚠️  Limit: 30%
```

---

#### 3.2 Dynamic risk adjustment near resolution
**Проблема:** Одинаковое поведение для рынков за 1 день и за 1 год

**Решение:**
```typescript
if (daysToResolution < 7) {
    // Ближе к разрешению = больше риск
    maxAIRisk = 'low';           // Только low risk
    minEdge = 0.15;              // 15 п.п. вместо 10 п.п.
    orderSizeMultiplier *= 0.5;  // Половина размера
}
```

**Файлы:** `AIStrategy.ts`

---

#### 3.3 Batch processing для параллельного анализа
**Проблема:** Analyze all 100 markets → долго и дорого

**Решение:**
- [ ] Batch size = 10 markets
- [ ] Process batch → wait 5 sec → next batch
- [ ] Прогресс-бар в логах
- [ ] Cancellation при превышении бюджета

**Файлы:** `ai-market-filter.ts`

**Метрики:**
- Before: 100 markets за 60 сек, $1.50
- After: 100 markets за 90 сек, $1.00 (rate limiting, но дешевле)

---

#### 3.4 Real-time position updates
**Проблема:** Позиции не обновляются после перезагрузки бота

**Решение:**
- [ ] loadPositionsFromChain() при старте
- [ ] Периодическое обновление каждые 5 минут
- [ ] Reconciliation между локальным state и chain
- [ ] Логирование расхождений

**Файлы:** `bot-ai.ts`

---

### Phase 4: Оптимизации (P3) ⚡

**Deadline:** 2-4 недели | **Impact:** Low-Medium

#### 4.1 Prompt caching (OpenAI latest models)
**Проблема:** Переплачиваем за повторяющийся system prompt

**Решение:**
- [ ] Использовать prompt caching API
- [ ] System prompt кэшируется → 50% дешевле
- [ ] TTL = 5-10 минут

**Экономия:** ~40-50% на input tokens

---

#### 4.2 A/B testing different AI models
**Решение:**
- [ ] Split traffic: 50% gpt-4o, 50% gpt-4o-mini
- [ ] Compare metrics:
  - Win Rate
  - Avg Return
  - Cost per trade
- [ ] Choose winner after 1000 trades

**Файлы:** `openai.service.ts`, `analytics.service.ts`

---

#### 4.3 Slippage & Price Impact estimation
**Проблема:** Не учитываем, что наш ордер сдвинет цену

**Решение:**
```typescript
const orderbook = await getOrderbook(tokenId);
const priceImpact = calculatePriceImpact(orderSize, orderbook);

if (priceImpact > 0.02) {  // 2% slippage
    console.warn(`⚠️  High slippage: ${priceImpact * 100}%`);
    orderSize *= 0.5;  // Уменьшаем размер
}
```

**Файлы:** Новый `price-impact.ts`

---

#### 4.4 Multi-AI provider fallback (опционально)
**Текущее:** fail-fast (один провайдер)

**Альтернатива:** Fallback chain
```typescript
if (OPENAI_API_KEY) {
    try { return await openai.generate(...); }
    catch { /* fallback to Gemini */ }
}

if (GEMINI_API_KEY) {
    return await gemini.generate(...);
}

throw new Error('No AI provider available');
```

**Плюсы:** Высокая availability
**Минусы:** Сложнее debugging, скрывает проблемы

**Рекомендация:** Не нужно сейчас (fail-fast лучше)

---

## 📈 Метрики успеха

### Технические метрики

| Метрика | Baseline | Target P1 | Target P2 |
|---------|----------|-----------|-----------|
| estimatedProbability coverage | ~80% | 100% | 100% |
| Rate limit errors | 5-10/день | 0 | 0 |
| AI analysis latency | 60 сек | 40 сек | 30 сек |
| Cost per cycle | $0.015 | $0.010 | $0.008 |
| Cache hit rate (Tavily) | 0% | 60% | 80% |

### Бизнес метрики

| Метрика | Target P1 | Target P2 |
|---------|-----------|-----------|
| Win Rate (AI) | > 55% | > 60% |
| Avg Return per trade | > 2% | > 3% |
| Alpha (AI - baseline) | > 3% | > 5% |
| Max Drawdown | < 15% | < 10% |
| Sharpe Ratio | > 1.5 | > 2.0 |

---

## 🛠️ Implementation Plan

### Week 1: P0 Fixes
- День 1-2: estimatedProbability guarantee + validation
- День 2-3: Rate limiting + RequestQueue
- День 3-4: Testing + monitoring

### Week 2: P1 Features (Part 1)
- День 1-3: P&L Tracking + AnalyticsService
- День 4-5: Dynamic position sizing

### Week 3: P1 Features (Part 2)
- День 1-2: Tavily caching
- День 3-4: Retry logic for AI
- День 5: Integration testing

### Week 4-5: P2 Improvements
- Portfolio correlation check
- Dynamic risk adjustment
- Batch processing
- Real-time position updates

### Week 6+: P3 Optimizations
- Prompt caching
- A/B testing
- Slippage estimation

---

## 🎬 Quick Wins (можно сделать за 1 день)

1. **estimatedProbability validation** (2 часа)
   - Усилить промпт
   - Добавить fallback

2. **Tavily caching** (2 часа)
   - Map + TTL
   - Логирование

3. **AI response validation** (2 часа)
   - Проверка логики
   - Fallback на AVOID

4. **Better logging** (1 час)
   - Структурированные логи
   - Timestamps

5. **Config validation at startup** (1 час)
   - Проверка API keys
   - Проверка лимитов

---

## 💡 Design Decisions

### Почему fail-fast (а не fallback chain)?
**Решение:** Оставить fail-fast подход для AI провайдеров

**Причины:**
1. Проще debugging (всегда знаешь какой провайдер)
2. Явные ошибки лучше скрытых проблем
3. Production должен быть стабильным (не переключаться между API)

**Альтернатива:** Добавить health check и alerting

---

### Почему RequestQueue (а не Promise.all)?
**Решение:** Sequential processing с queue

**Причины:**
1. Rate limiting - критично для OpenAI
2. Cost control - легче остановить при превышении бюджета
3. Graceful degradation - можно skip если долго

**Альтернатива:** Batching с Promise.all (более рискованно)

---

### Почему кэшировать Tavily, но не AI анализ?
**Решение:** Кэшировать только Tavily

**Причины:**
1. Tavily стоит дорого ($0.02), AI дешевле ($0.008)
2. Tavily результаты стабильны (новости меняются медленно)
3. AI анализ зависит от контекста (цена, дата)

**TTL:**
- Tavily: 1 час (новости)
- AI analysis: 5 минут (цены меняются)

---

## 🔍 Research Questions

### 1. Оптимальный minEdge?
**Текущее:** 10 п.п. (0.10)

**Исследование:**
- Протестировать: 5 п.п., 10 п.п., 15 п.п.
- Метрики: Win Rate, Avg Return, # trades
- Hypothesis: 10 п.п. = оптимально (balance риск/доходность)

### 2. Влияние новостей на accuracy?
**Текущее:** useNews = true

**Исследование:**
- A/B test: с новостями vs без новостей
- Метрики: Win Rate, confidence, cost
- Hypothesis: Новости дают +3-5% Win Rate

### 3. Лучшая модель для prediction markets?
**Текущее:** gpt-4o (prod), gpt-4o-mini (dev)

**Исследование:**
- Test: gpt-4o, gpt-4o-mini, claude-3.5-sonnet
- Метрики: accuracy, cost, latency
- Hypothesis: gpt-4o лучший по accuracy

---

## 📚 References

- [Polymarket API Docs](https://docs.polymarket.com)
- [OpenAI Best Practices](https://platform.openai.com/docs/guides/prompt-engineering)
- [Kelly Criterion for position sizing](https://en.wikipedia.org/wiki/Kelly_criterion)
- [Prediction Market literature](https://mason.gmu.edu/~rhanson/mktscore.pdf)

---

## ✅ Checklist для Production

### Pre-launch:
- [ ] P0 fixes завершены (estimatedProbability, rate limiting)
- [ ] P&L tracking работает
- [ ] Alerting настроен (errors, budget exceeded)
- [ ] Logs centralized (CloudWatch, DataDog, etc.)
- [ ] Backup strategy для AI unavailability

### Monitoring:
- [ ] Win Rate dashboard
- [ ] Cost per cycle tracking
- [ ] API errors/latency
- [ ] Position exposure by category

### Post-launch:
- [ ] Weekly review of AI performance
- [ ] A/B tests for improvements
- [ ] Community feedback analysis

---

**Последнее обновление:** 2025-11-04
**Автор:** AI Analysis
**Статус:** Ready for implementation 🚀
