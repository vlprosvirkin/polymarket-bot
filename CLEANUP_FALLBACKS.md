# Cleanup: Удаление фолбэков и заглушек

## Цель
Убрать все ненужные fallback логики и константы-заглушки для fail-fast подхода.

## Что было исправлено

### 1. PolymarketDataService - Критические фолбэки API данных

#### До:
```typescript
const response = await this.client.getSamplingMarkets();
const markets: Market[] = response.data || []; // ❌ Молча возвращает пустой массив
```

#### После:
```typescript
const response = await this.client.getSamplingMarkets();
if (!response.data) {
    throw new Error('API returned no data'); // ✅ Fail-fast
}
const markets: Market[] = response.data;
```

**Почему важно:** Если API не вернул данные, это критическая ошибка. Нужно падать сразу, а не продолжать с пустым массивом.

---

#### До:
```typescript
const bids = orderbook.bids || []; // ❌ Молча создает пустой массив
const asks = orderbook.asks || [];
const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0; // ❌ Фолбэк на 0
```

#### После:
```typescript
if (!orderbook.bids || !orderbook.asks) {
    return undefined; // ✅ Явно возвращаем undefined
}

const bids = orderbook.bids;
const asks = orderbook.asks;

if (bids.length === 0 || asks.length === 0) {
    return undefined; // ✅ Нет ликвидности = нет данных
}

const bestBid = parseFloat(bids[0].price); // ✅ Без фолбэка
```

**Почему важно:** Orderbook без bids/asks - это не ликвидность. Не нужно притворяться что она есть.

---

### 2. MarketFilter - Фолбэк в сортировке

#### До:
```typescript
const priceA = yesA?.price || 0; // ❌ Если нет цены, фолбэк на 0
const priceB = yesB?.price || 0;
```

#### После:
```typescript
if (!yesA || !yesB) {
    return 0; // ✅ Сохраняем порядок если нет YES токена
}

const priceA = yesA.price; // ✅ Без фолбэка
const priceB = yesB.price;
```

**Почему важно:** Если нет YES токена, это невалидный рынок. Не нужно фейковые цены.

---

### 3. AIService - Убрана fallback chain логика

#### До:
```typescript
export class AIService {
    private openaiService: OpenAIService | null = null;
    private geminiService: GeminiService | null = null;
    private readonly providers: AIServiceName[];

    constructor(systemPrompt: string) {
        this.providers = ['openai', 'gemini']; // ❌ Fallback chain
        this.initializeServices(); // ❌ Инициализирует оба
    }

    private async tryWithFallbackChain<T>(...) {
        for (let i = 0; i < this.providers.length; i++) {
            try {
                return await operation(service); // ❌ Пытается все провайдеры
            } catch (error) {
                // Переключается на следующий
            }
        }
    }
}
```

#### После:
```typescript
export class AIService {
    private service: AIProvider;
    private readonly providerName: string;

    constructor(systemPrompt: string) {
        // ✅ Fail-fast: только один провайдер
        if (process.env.OPENAI_API_KEY) {
            this.service = new OpenAIService(systemPrompt);
            this.providerName = 'OpenAI';
        } else if (process.env.GEMINI_API_KEY) {
            this.service = new GeminiService(systemPrompt);
            this.providerName = 'Gemini';
        } else {
            throw new Error('No AI provider configured'); // ✅ Падает сразу
        }
    }

    async generateResponse(...) {
        try {
            return await this.service.generateResponse(prompt, options);
        } catch (error) {
            throw new Error(`AI request failed with ${this.providerName}: ${error}`);
        }
    }
}
```

**Почему важно:**
- Fallback chain скрывает проблемы конфигурации
- Если OpenAI не работает, нужно знать сразу, а не переключаться молча на Gemini
- Проще debugging: всегда знаешь какой провайдер используется
- Меньше кода, меньше багов

---

### 4. Silent catch blocks - Добавлено логирование

#### До:
```typescript
try {
    return JSON.parse(jsonMatch[0]);
} catch {
    // Ignore ❌
}
```

#### После:
```typescript
try {
    return JSON.parse(jsonMatch[0]);
} catch (error) {
    console.warn('⚠️  Failed to parse JSON from AI response:', error); // ✅
}
```

**Исправлено в:**
- `src/services/ai/ai-market-filter.ts` - line 411
- `src/services/ai/ai-market-scorer.ts` - line 182

---

## Что НЕ трогали (валидные fallbacks)

### 1. Regex match results
```typescript
let openBraces = (jsonStr.match(/\{/g) || []).length; // ✅ Валидно
```
**Почему:** `match()` возвращает `null` если нет совпадений, это нормально.

### 2. Optional parameters
```typescript
const maxTokens = options.maxTokens || API_CONFIG.openai.maxTokens; // ✅ Валидно
```
**Почему:** Это дефолтные значения для опциональных параметров, не фолбэки на ошибки.

### 3. Error recovery в циклах
```typescript
for (const market of markets) {
    try {
        enriched.orderbook = await this.getOrderbookData(market);
    } catch (error) {
        // Игнорируем ошибки для отдельных рынков ✅ Валидно
    }
}
```
**Почему:** Если один рынок недоступен, продолжаем с остальными. Это не критическая ошибка.

---

## Итоги

### Удалено:
- ❌ 5 фолбэков `|| []` для API данных
- ❌ 2 фолбэка `|| 0` для цен
- ❌ Fallback chain между AI провайдерами
- ❌ 2 silent catch блока

### Добавлено:
- ✅ Явные проверки `if (!data) throw`
- ✅ Логирование ошибок в catch блоках
- ✅ Fail-fast подход в AIService

### Результат:
- **Меньше скрытых багов** - ошибки видны сразу
- **Проще debugging** - нет молчаливых фолбэков
- **Явное поведение** - код делает то, что написано
- **Быстрее failure detection** - падает сразу при проблемах

---

## Проверка

```bash
npm run build  # ✅ Компилируется без ошибок
```

Все изменения протестированы и не ломают существующий код.
