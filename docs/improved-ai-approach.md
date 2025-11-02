# Улучшенный подход: Комбинирование AI Market Scorer + AI Predictions

## 🎯 Концепция

**Многоуровневая фильтрация и анализ:**

```
1. Базовая фильтрация (жесткие правила)     → Быстро отсеиваем 90% рынков
2. AI Market Scorer (качество рынка)        → Фильтруем по привлекательности
3. AI Prediction + Edge Detection           → Находим конкретные возможности
4. Улучшенная генерация сигналов             → С учетом AI edge
```

---

## Архитектура улучшенного подхода

### Этап 1: Базовая фильтрация (существующий)
```typescript
// Быстрая фильтрация по жестким правилам
const basicFiltered = markets.filter(m => {
    return m.active && !m.closed && 
           m.tokens.length > 0 &&
           (!config.excludeNegRisk || !m.neg_risk) &&
           // ... другие правила
});
```

### Этап 2: AI Market Scorer (улучшенный)
```typescript
// Оценка качества рынков AI
const scored = await aiScorer.scoreMarkets(basicFiltered);
const qualityFiltered = scored
    .filter(s => s.score.score >= 0.7)  // Минимум 70% качества
    .slice(0, 20)  // Топ 20 по качеству
    .map(s => s.market);
```

### Этап 3: AI Prediction + Edge Detection (новый)
```typescript
// AI делает прогноз и ищет расхождения с рынком
const opportunities = await Promise.all(
    qualityFiltered.map(async (market) => {
        // AI прогноз вероятности
        const aiPrediction = await aiPredictor.predictOutcome(market);
        const marketPrice = market.tokens[0].price;
        
        // Edge = разница между AI прогнозом и рыночной ценой
        const edge = (aiPrediction / 100) - marketPrice;
        
        return {
            market,
            aiPrediction,
            marketPrice,
            edge,
            // Направление: положительный edge = рынок недооценивает
            direction: edge > 0 ? 'YES' : 'NO'
        };
    })
);

// Фильтруем по минимальному edge
const withEdge = opportunities
    .filter(o => Math.abs(o.edge) >= 0.10)  // Минимум 10% edge
    .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));  // Сортируем по edge
```

### Этап 4: Генерация сигналов с учетом edge
```typescript
// Генерируем сигналы с учетом AI edge
for (const opportunity of withEdge) {
    if (opportunity.edge > 0) {
        // AI думает, что вероятность выше → BUY YES
        signals.push({
            market: opportunity.market,
            tokenId: yesToken.token_id,
            side: OrderSide.BUY,
            price: opportunity.marketPrice,
            size: calculateSizeFromEdge(opportunity.edge),  // Размер зависит от edge
            reason: `AI edge: +${(opportunity.edge * 100).toFixed(1)}% (AI: ${opportunity.aiPrediction}% vs Market: ${(opportunity.marketPrice * 100).toFixed(1)}%)`
        });
    } else {
        // AI думает, что вероятность ниже → SELL или не торговать
        // или SHORT позиция
    }
}
```

---

## Новые компоненты

### 1. AI Outcome Predictor

**Назначение**: Делает прогноз вероятности исхода события

```typescript
export class AIOutcomePredictor {
    async predictOutcome(market: Market, context?: PredictionContext): Promise<number> {
        // Прогноз вероятности 0-100%
    }
}
```

### 2. Edge Calculator

**Назначение**: Вычисляет расхождение между AI прогнозом и рынком

```typescript
export class EdgeCalculator {
    calculateEdge(aiPrediction: number, marketPrice: number): EdgeResult {
        // Возвращает edge, направление, уверенность
    }
}
```

### 3. Kelly Criterion Calculator (опционально)

**Назначение**: Оптимальный размер ставки на основе edge

```typescript
export class KellyCalculator {
    calculateBetSize(edge: number, marketPrice: number, bankroll: number): number {
        // Kelly Criterion для расчета размера
    }
}
```

---

## План внедрения

### Фаза 1: Добавить AI Prediction (минимальные изменения)

**Файлы:**
- `src/services/ai/ai-outcome-predictor.ts` - новый сервис
- Обновить существующие стратегии для опционального использования

**Интеграция:**
```typescript
// В EndgameStrategy или HighConfidenceStrategy
private aiPredictor?: AIOutcomePredictor;

async filterMarkets(markets: Market[]): Promise<Market[]> {
    // 1. Базовая фильтрация
    const basic = this.basicFilter(markets);
    
    // 2. AI Scorer (если включен)
    if (this.useAI) {
        const scored = await this.aiScorer.scoreMarkets(basic);
        const quality = scored.filter(s => s.score.score >= 0.7).map(s => s.market);
        
        // 3. AI Prediction (новое)
        if (this.aiPredictor) {
            const predictions = await Promise.all(
                quality.map(async (m) => {
                    const aiProb = await this.aiPredictor!.predictOutcome(m);
                    const marketProb = m.tokens[0].price;
                    const edge = (aiProb / 100) - marketProb;
                    return { market: m, edge };
                })
            );
            
            // Фильтруем по edge
            return predictions
                .filter(p => Math.abs(p.edge) >= 0.10)
                .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))
                .slice(0, this.config.maxMarkets)
                .map(p => p.market);
        }
        
        return quality.slice(0, this.config.maxMarkets);
    }
    
    return basic.slice(0, this.config.maxMarkets);
}
```

### Фаза 2: Улучшить генерацию сигналов

**Обновить `generateSignals()`:**
```typescript
async generateSignals(market: Market, currentPrice: number, position?: Position): Promise<TradeSignal[]> {
    // Если есть AI prediction, используем edge
    if (this.aiPredictor) {
        const aiPrediction = await this.aiPredictor.predictOutcome(market);
        const edge = (aiPrediction / 100) - currentPrice;
        
        // Edge должен быть значительным
        if (Math.abs(edge) < 0.10) {
            return []; // Нет достаточного edge
        }
        
        // Генерируем сигнал с учетом edge
        if (edge > 0) {
            // AI думает, что вероятность выше → BUY YES
            const size = this.calculateSizeFromEdge(edge, currentPrice);
            return [{
                market,
                tokenId: yesToken.token_id,
                side: OrderSide.BUY,
                price: currentPrice,
                size,
                reason: `AI edge: +${(edge * 100).toFixed(1)}%`
            }];
        }
    }
    
    // Fallback на существующую логику
    return this.generateSignalsDefault(market, currentPrice, position);
}
```

### Фаза 3: Добавить конфигурацию

**Новые параметры стратегии:**
```typescript
interface EnhancedStrategyConfig extends StrategyConfig {
    // AI настройки
    useAI: boolean;
    useAIPredictions: boolean;
    minAIEdge: number;  // Минимальный edge для сделки (например, 0.10 = 10%)
    minAIScore: number;  // Минимальный score качества рынка (0-1)
    
    // Размер ставки
    useKellyCriterion: boolean;
    kellyFraction: number;  // Дробное Келли (например, 0.25 = 25%)
}
```

---

## Преимущества улучшенного подхода

### ✅ Комбинирует лучшее из обоих методов:

1. **Качество рынка** (наш подход)
   - AI Market Scorer отфильтровывает плохие рынки
   - Защита от проблемных рынков

2. **Поиск возможностей** (подход Poly-Trader)
   - AI Prediction находит расхождения с рынком
   - Edge detection находит конкретные возможности

3. **Гибкость**
   - Можно использовать по отдельности или вместе
   - Легко включать/выключать компоненты

4. **Масштабируемость**
   - Сначала быстрая фильтрация (экономит API вызовы)
   - Потом детальный анализ топ-кандидатов

---

## Пример полного потока

```
1. getSamplingMarkets() → 1000 рынков

2. Базовая фильтрация:
   - Активные, принимают ордера
   - Не NegRisk
   - В диапазоне цен
   → 200 рынков

3. AI Market Scorer:
   - Оцениваем качество каждого рынка
   - Фильтруем по score >= 0.7
   → 30 рынков

4. AI Prediction:
   - Для каждого из 30 делаем прогноз
   - Сравниваем с рыночной ценой
   - Вычисляем edge
   → 10 рынков с edge >= 10%

5. Генерация сигналов:
   - Для каждого рынка с edge генерируем сигнал
   - Размер ставки зависит от edge (Kelly Criterion)
   → 5-10 сигналов

6. Исполнение:
   - Размещаем ордера
   - Логируем edge для анализа
```

---

## Риски и митигация

### ⚠️ Потенциальные проблемы:

1. **Задержки API**
   - **Проблема**: Много AI запросов → медленно
   - **Решение**: Batch processing, кеширование, асинхронность

2. **Стоимость API**
   - **Проблема**: Каждый AI запрос стоит денег
   - **Решение**: Двухэтапный подход (сначала быстро, потом детально)

3. **Точность прогнозов**
   - **Проблема**: AI может ошибаться
   - **Решение**: Минимальный edge (например, 15%), проверка исторических результатов

4. **Рыночная эффективность**
   - **Проблема**: Если рынок эффективен, edge будет маленький
   - **Решение**: Это нормально - делаем только при значительном edge

---

## Следующие шаги

1. **Создать AIOutcomePredictor** сервис
2. **Добавить EdgeCalculator** утилиту
3. **Интегрировать в существующие стратегии** (опционально)
4. **Добавить конфигурацию** для включения/выключения
5. **Создать тесты** для проверки работы

Готов начать реализацию? Какой этап внедрить первым?

