# Как работает AI Strategy - Детальное объяснение

## 🎯 Общая схема

AI Strategy использует **двухэтапную фильтрацию** для выбора лучших рынков:

```
1. Базовая фильтрация (жесткие правила)
   ↓
   ~1000 рынков → ~100 рынков
   
2. AI фильтрация (умный анализ)
   ↓
   ~100 рынков → ~5-10 лучших рынков
```

---

## 📊 Этап 1: Базовая фильтрация (быстрая, ~1 секунда)

**Метод:** `basicFilter()` в `AIStrategy.ts`

### Что проверяется:

```typescript
✅ market.active === true
✅ market.closed === false
✅ market.accepting_orders === true
✅ market.tokens.length > 0
✅ market.volume >= minVolume (например, $5000)
✅ !market.neg_risk (если excludeNegRisk = true)
✅ yesToken.price >= minPrice (например, 0.70 = 70%)
✅ yesToken.price <= maxPrice (например, 0.99 = 99%)
```

### Результат:

- **Вход:** ~1000 рынков из API
- **Выход:** ~100 рынков (отсеивает 90%)
- **Скорость:** Очень быстро (< 1 сек)

**Пример:**
```
Рынок 1: volume = $50 → ❌ Отсеян (minVolume = $5000)
Рынок 2: active = false → ❌ Отсеян
Рынок 3: yesPrice = 0.60 → ❌ Отсеян (minPrice = 0.70)
Рынок 4: Все ОК → ✅ Проходит
```

---

## 🤖 Этап 2: AI фильтрация (умный анализ, ~30-60 секунд)

**Метод:** `asyncFilterMarkets()` → `AIMarketFilter.filterMarkets()`

### Процесс для каждого рынка:

#### 2.1. Получение новостей (если включено)

```typescript
// Для каждого рынка:
const keywords = serpApiService.extractKeywords(market.question);
// Например: "Will Lakers win tonight?" → "Lakers win tonight"

const news = await serpApiService.searchNews(keywords, {
    numResults: 5,
    timeRange: 'past_24h'  // Последние 24 часа
});
```

**Пример новостей:**
```
1. "LeBron James Injury Update - ESPN"
   "Lakers star LeBron James questionable for tonight's game..."

2. "Lakers Roster Changes - NBA.com"
   "Team announces new starting lineup..."
```

#### 2.2. Построение промпта для AI

**Данные, которые передаются AI:**

```markdown
**Market Information:**
Question: "Will Lakers win tonight?"
Description: "NBA game between Lakers and Warriors"
Category: "sports"

**Current Market Data:**
- YES Token Price: 65.5%
- NO Token Price: 34.5%
- Market Active: true
- Days to Resolution: 1
- Resolution Date: 2024-12-25

**Recent News (Last 24 Hours):**  ← Если новости включены
1. "LeBron James Injury Update - ESPN"
   "Lakers star LeBron James questionable..."
   
2. "Lakers Roster Changes - NBA.com"
   ...

**Analysis Questions to Consider:**
1. Is the question clear and will it resolve unambiguously?
2. Does the current market price seem efficient?
3. What are the main risks?
4. Are there opportunities for profitable trading?
5. Based on recent news, is there new information?
```

#### 2.3. AI анализ рынка

**AI получает промпт и возвращает JSON:**

```json
{
  "shouldTrade": true,
  "confidence": 0.75,
  "reasoning": "Market at 65.5% seems slightly undervalued given recent roster improvements. Injury concerns are moderate but team depth is strong.",
  "attractiveness": 0.72,
  "riskLevel": "medium",
  "riskFactors": [
    "Injury uncertainty",
    "Opponent strength"
  ],
  "opportunities": [
    "Recent roster improvements",
    "Home court advantage",
    "Market price potential mispricing"
  ],
  "recommendedAction": "BUY_YES"
}
```

#### 2.4. Применение дополнительных фильтров

После AI анализа применяются конфигурационные фильтры:

```typescript
// 1. Фильтр по shouldTrade
tradable = results.filter(r => r.analysis.shouldTrade === true)

// 2. Фильтр по minAttractiveness (например, 0.65 = 65%)
filtered = filtered.filter(r => 
    r.analysis.attractiveness >= 0.65
)

// 3. Фильтр по maxRisk
riskLevels = { low: 0, medium: 1, high: 2 }
filtered = filtered.filter(r => 
    riskLevels[r.analysis.riskLevel] <= riskLevels['medium']
)

// 4. Фильтр по категориям (если настроены)
filtered = filtered.filter(r =>
    preferredCategories.includes(r.market.category)
)

// 5. Сортировка по attractiveness (лучшие сначала)
filtered.sort((a, b) => 
    b.analysis.attractiveness - a.analysis.attractiveness
)
```

### Результат AI фильтрации:

- **Вход:** ~100 рынков (после базовой фильтрации)
- **Выход:** ~5-10 лучших рынков
- **Скорость:** ~30-60 секунд (для 100 рынков)
- **Стоимость:** ~$0.05-0.15 за цикл

---

## 🔄 Полный процесс в боте

### В `bot-ai.ts`:

```typescript
// 1. Получаем все рынки
const response = await this.client.getSamplingMarkets();
const allMarkets = response.data || [];  // ~1000 рынков

// 2. AI фильтрация (внутри использует базовую + AI)
const filteredMarkets = await this.strategy.asyncFilterMarkets(allMarkets);
// Результат: ~5-10 лучших рынков

// 3. Для каждого рынка генерируем сигналы
for (const market of filteredMarkets) {
    const signals = await this.strategy.asyncGenerateSignals(
        market, 
        currentPrice
    );
    
    // 4. Исполняем сигналы
    for (const signal of signals) {
        await this.executeSignal(signal);
    }
}
```

---

## 🎯 Генерация сигналов

### Метод: `asyncGenerateSignals()`

#### Если `useAIForSignals = true`:

```typescript
// 1. Повторный AI анализ (более детальный)
const analysis = await this.aiFilter.analyzeMarket(market, context);

// 2. Проверки
if (!analysis.shouldTrade) {
    return [];  // AI говорит не торговать
}

if (analysis.riskLevel === 'high' && maxRisk === 'low') {
    return [];  // Риск слишком высокий
}

if (analysis.recommendedAction === 'AVOID') {
    return [];  // AI рекомендует избегать
}

// 3. Генерация сигнала на основе AI
if (analysis.recommendedAction === 'BUY_YES') {
    const size = calculateOrderSize(currentPrice, analysis.attractiveness);
    
    signals.push({
        tokenId: yesToken.token_id,
        side: OrderSide.BUY,
        price: currentPrice,
        size: size,  // Размер зависит от attractiveness
        reason: `AI: ${analysis.reasoning}`
    });
}
```

#### Размер ордера на основе attractiveness:

```typescript
const multiplier = 1 + attractiveness;  // 1.0 - 2.0
const size = baseSize * multiplier;

// Пример:
// attractiveness = 0.5 → size = baseSize * 1.5
// attractiveness = 0.8 → size = baseSize * 1.8
```

#### Если `useAIForSignals = false`:

Используется базовая логика:
- Покупаем YES если цена в допустимом диапазоне
- Размер фиксированный (`orderSize`)

---

## 📈 Пример полного цикла

### Входные данные:

```typescript
Всего рынков: 1000

Рынок A: "Will Lakers win tonight?"
  - active: true
  - volume: $10,000
  - yesPrice: 0.65
  - category: "sports"

Рынок B: "Will Bitcoin hit $100k?"
  - active: true
  - volume: $50,000
  - yesPrice: 0.75
  - category: "crypto"
```

### Этап 1: Базовая фильтрация

```
Рынок A: ✅ Проходит (все критерии ОК)
Рынок B: ✅ Проходит
... (остальные 98 рынков проходят)
```

**Результат:** 100 рынков

### Этап 2: AI фильтрация

#### Рынок A - AI анализ:

**Новости:**
- "LeBron questionable" (негативная)
- "Lakers roster depth" (позитивная)

**AI ответ:**
```json
{
  "shouldTrade": true,
  "attractiveness": 0.68,
  "riskLevel": "medium",
  "reasoning": "Injury concerns but team depth strong",
  "recommendedAction": "BUY_YES"
}
```

#### Рынок B - AI анализ:

**Новости:**
- "Bitcoin volatility" (негативная)
- "Market uncertainty" (негативная)

**AI ответ:**
```json
{
  "shouldTrade": false,
  "attractiveness": 0.45,
  "riskLevel": "high",
  "reasoning": "High volatility, unclear market direction",
  "recommendedAction": "AVOID"
}
```

### Применение фильтров:

```typescript
minAttractiveness: 0.65
maxRisk: 'medium'

Рынок A: 
  - attractiveness: 0.68 >= 0.65 ✅
  - riskLevel: 'medium' <= 'medium' ✅
  → ✅ Проходит

Рынок B:
  - attractiveness: 0.45 < 0.65 ❌
  → ❌ Отсеян
```

### Сортировка:

```
Рынок A: attractiveness = 0.68 → Топ-5
... (остальные рынки по убыванию)
```

### Финальный результат:

```
✅ 5 лучших рынков (сортированные по attractiveness)
→ Рынок A попадает в топ
```

---

## ⚙️ Конфигурация

### Минимальные требования для AI фильтрации:

```typescript
{
    useAI: true,                    // ✅ Включить AI
    useNews: true,                  // ✅ Включить новости (если SERP_API_KEY есть)
    minAIAttractiveness: 0.65,      // Минимум 65% привлекательности
    maxAIRisk: 'medium',            // Максимум средний риск
    useAIForSignals: true           // ✅ AI для генерации сигналов
}
```

### Без новостей (быстрее, дешевле):

```typescript
{
    useAI: true,
    useNews: false,                  // ❌ Без новостей
    minAIAttractiveness: 0.60,
    maxAIRisk: 'high',
    useAIForSignals: false          // Базовые сигналы
}
```

---

## 🎯 Ключевые моменты

1. **Двухэтапность:** Базовая фильтрация отсеивает 90%, AI анализирует оставшиеся 10%
2. **Параллельный анализ:** Все рынки анализируются параллельно (`Promise.all`)
3. **Новости добавляют контекст:** AI видит свежие события за последние 24 часа
4. **Многоуровневая фильтрация:** AI решение → attractiveness → risk → категории
5. **Размер ордера зависит от attractiveness:** Более привлекательные рынки = большие позиции

---

## 💰 Стоимость и время

### Для 100 рынков:

- **Без новостей:**
  - Время: ~30-40 секунд
  - Стоимость: ~$0.03-0.08 (OpenAI)

- **С новостями:**
  - Время: ~50-80 секунд
  - Стоимость: ~$0.05-0.15 (OpenAI + SerpAPI)

### Оптимизация:

Используйте базовую фильтрацию для предварительного отсева:
- Анализируйте только топ-50 рынков через AI
- Экономия: ~50% времени и стоимости

---

Подробнее: [ai-usage.md](ai-usage.md)

