# Использование AI Market Filter (Подход Poly-Trader)

## 🎯 Концепция

AI Market Filter использует AI для **детального анализа каждого рынка** и решения:
- **Стоит ли торговать** на этом рынке
- **Почему** стоит или не стоит
- **Какие риски** есть
- **Какие возможности** выявлены

Это похоже на подход [Poly-Trader](https://github.com/llSourcell/Poly-Trader), где AI анализирует рынки и выбирает лучшие для торговли.

---

## 🚀 Быстрый старт

### Базовое использование:

```typescript
import { AIMarketFilter } from './services/ai/ai-market-filter';

// 1. Инициализация
const filter = new AIMarketFilter();

// 2. Анализ одного рынка
const analysis = await filter.analyzeMarket(market, {
    strategyType: 'endgame',
    minAttractiveness: 0.6
});

// 3. Проверка решения
if (analysis.shouldTrade) {
    console.log('✅ Trade this market!');
    console.log('Reasoning:', analysis.reasoning);
} else {
    console.log('❌ Skip this market');
    console.log('Risks:', analysis.riskFactors);
}

// 4. Фильтрация нескольких рынков
const markets = await client.getSamplingMarkets();
const selected = await filter.filterMarkets(markets.data, {
    strategyType: 'endgame',
    minAttractiveness: 0.6,
    maxRisk: 'medium'
});

// selected содержит только рынки, на которых стоит торговать
```

---

## 📊 Что анализирует AI

### 1. Качество рынка
- Ясность формулировки вопроса
- Определенность критериев разрешения
- Четкость даты разрешения
- История похожих рынков

### 2. Эффективность рынка
- Разумность текущей цены
- Потенциальная неэффективность (mispricing)
- Настроения рынка
- Арбитражные возможности

### 3. Оценка рисков
- Основные факторы риска
- Потенциал манипуляций
- Волатильность
- Проблемы с разрешением

### 4. Возможности
- Что делает рынок привлекательным
- Четкие сигналы направления
- Достаточность информации
- Временные соображения

### 5. Соответствие стратегии
- Подходит ли для вашей стратегии
- Соответствие уровню риска
- Категориальные соображения

---

## 🔧 Конфигурация

### FilterContext параметры:

```typescript
interface FilterContext {
    strategyType?: 'endgame' | 'high-confidence' | 'market-making';
    minAttractiveness?: number;      // Минимум 0.6 = 60%
    maxRisk?: 'low' | 'medium' | 'high';
    preferredCategories?: string[];   // ['sports', 'politics']
    excludedCategories?: string[];    // ['crypto']
}
```

### Примеры конфигураций:

**Консервативная стратегия:**
```typescript
{
    strategyType: 'endgame',
    minAttractiveness: 0.8,      // Только очень привлекательные
    maxRisk: 'low',               // Только низкий риск
    preferredCategories: ['sports']  // Только спорт
}
```

**Агрессивная стратегия:**
```typescript
{
    strategyType: 'market-making',
    minAttractiveness: 0.5,       // Больше рынков
    maxRisk: 'high',              // Готовы к высокому риску
    excludedCategories: ['politics']  // Исключить политику
}
```

**Endgame стратегия:**
```typescript
{
    strategyType: 'endgame',
    minAttractiveness: 0.7,
    maxRisk: 'medium',
    // Нет ограничений по категориям
}
```

---

## 📈 Результат анализа

### MarketAnalysis структура:

```typescript
{
    shouldTrade: true,              // Стоит ли торговать
    confidence: 0.85,               // Уверенность 85%
    reasoning: "Market shows clear...",  // Детальное обоснование
    attractiveness: 0.75,           // Привлекательность 75%
    riskLevel: 'medium',            // Уровень риска
    riskFactors: [                  // Конкретные риски
        "Political event - high volatility",
        "Close to resolution date"
    ],
    opportunities: [                // Возможности
        "Clear resolution criteria",
        "Strong market consensus"
    ],
    recommendedAction: 'BUY_YES'    // Рекомендуемое действие
}
```

---

## 🔄 Интеграция в стратегии

### Вариант 1: Заменить filterMarkets()

```typescript
// В вашей стратегии (например, EndgameStrategy)
import { AIMarketFilter } from '../services/ai/ai-market-filter';

export class EndgameStrategyWithAI implements IStrategy {
    private aiFilter: AIMarketFilter;

    constructor(config: EndgameConfig) {
        this.config = config;
        this.aiFilter = new AIMarketFilter();
    }

    async filterMarkets(markets: Market[]): Promise<Market[]> {
        // 1. Базовая фильтрация (быстрая)
        const basicFiltered = markets.filter(m => {
            return m.active && !m.closed && 
                   m.accepting_orders &&
                   (!this.config.excludeNegRisk || !m.neg_risk);
        });

        // 2. AI фильтрация (как Poly-Trader)
        const aiSelected = await this.aiFilter.filterMarkets(basicFiltered, {
            strategyType: 'endgame',
            minAttractiveness: 0.7,
            maxRisk: 'medium'
        });

        // 3. Возвращаем только отобранные AI рынки
        return aiSelected.map(item => item.market);
    }
}
```

### Вариант 2: Двухэтапная фильтрация

```typescript
async filterMarkets(markets: Market[]): Promise<Market[]> {
    // Этап 1: Ваши жесткие правила
    const ruleFiltered = this.basicFilter(markets);

    // Этап 2: AI анализ (только для прошедших этап 1)
    const aiSelected = await this.aiFilter.filterMarkets(ruleFiltered, {
        strategyType: 'endgame',
        minAttractiveness: 0.6
    });

    return aiSelected.map(item => item.market);
}
```

### Вариант 3: Использование в боте

```typescript
// В PolymarketBot
class PolymarketBot {
    private aiFilter: AIMarketFilter;

    async getActiveMarkets(): Promise<Market[]> {
        // 1. Получаем рынки
        const response = await this.client.getSamplingMarkets();
        const allMarkets = response.data || [];

        // 2. AI фильтрация (как Poly-Trader)
        this.aiFilter = new AIMarketFilter();
        const aiSelected = await this.aiFilter.filterMarkets(allMarkets, {
            strategyType: 'endgame',
            minAttractiveness: 0.7,
            maxRisk: 'medium'
        });

        // 3. Логируем решения AI
        aiSelected.forEach(item => {
            console.log(`\n📊 ${item.market.question}`);
            console.log(`   AI Decision: ${item.analysis.shouldTrade ? '✅ TRADE' : '❌ SKIP'}`);
            console.log(`   Attractiveness: ${(item.analysis.attractiveness * 100).toFixed(1)}%`);
            console.log(`   Reasoning: ${item.analysis.reasoning.substring(0, 100)}...`);
        });

        return aiSelected.map(item => item.market);
    }
}
```

---

## 🎯 Сравнение с Poly-Trader

| Аспект | Poly-Trader | Наш AI Market Filter |
|--------|-------------|---------------------|
| **Цель** | Найти edge (расхождение) | Выбрать лучшие рынки |
| **Анализ** | Прогноз + сравнение с ценой | Детальный анализ привлекательности |
| **Выход** | Edge percentage | Should trade + reasoning |
| **Использование** | Для расчета размера ставки | Для фильтрации рынков |

**Преимущества нашего подхода:**
- ✅ Более детальный анализ рынка
- ✅ Учитывает риски и возможности
- ✅ Легко интегрируется в существующие стратегии
- ✅ Возвращает обоснование решения

---

## 💡 Примеры использования

### Пример 1: Выбор топ-5 рынков

```typescript
const filter = new AIMarketFilter();
const markets = await client.getSamplingMarkets();

const selected = await filter.filterMarkets(markets.data, {
    strategyType: 'endgame',
    minAttractiveness: 0.7
});

// Берем топ-5 самых привлекательных
const top5 = selected
    .sort((a, b) => b.analysis.attractiveness - a.analysis.attractiveness)
    .slice(0, 5)
    .map(item => item.market);
```

### Пример 2: Анализ перед входом

```typescript
async generateSignals(market: Market, currentPrice: number): Promise<TradeSignal[]> {
    // Перед генерацией сигнала проверяем через AI
    const analysis = await this.aiFilter.analyzeMarket(market, {
        strategyType: 'endgame'
    });

    // Если AI говорит не торговать - пропускаем
    if (!analysis.shouldTrade) {
        console.log(`⚠️  AI recommends skipping: ${analysis.reasoning}`);
        return [];
    }

    // Если риск слишком высокий - пропускаем
    if (analysis.riskLevel === 'high') {
        console.log(`⚠️  High risk detected: ${analysis.riskFactors.join(', ')}`);
        return [];
    }

    // Иначе генерируем сигналы обычным способом
    return this.generateSignalsDefault(market, currentPrice);
}
```

---

## 🧪 Тестирование

```bash
# Запуск теста
ts-node src/test/test-ai-filter.ts

# Или через npm (если добавите в package.json)
npm run test:ai-filter
```

---

## ⚠️ Важные замечания

1. **Стоимость API**: Каждый анализ рынка = 1 API вызов
   - Рекомендуется использовать после базовой фильтрации
   - Можно кешировать результаты

2. **Скорость**: AI анализ медленнее жестких правил
   - Используйте для финального отбора
   - Не для первичной фильтрации тысяч рынков

3. **Точность**: AI может ошибаться
   - Всегда проверяйте reasoning
   - Используйте minAttractiveness для фильтрации
   - Логируйте решения для анализа

---

## 🚀 Следующие шаги

1. **Протестировать** на реальных рынках
2. **Настроить параметры** под вашу стратегию
3. **Интегрировать** в существующие стратегии
4. **Сравнить результаты** с жесткими правилами

Готовы интегрировать в вашу стратегию?

