# Безопасный Workflow для торговли

## 🎯 Цель

Разделить процесс на этапы, чтобы **НИ ОДНА стратегия не запускалась автоматически**. Все действия выполняются вручную через API.

## 📋 Workflow (пошаговый процесс)

### Этап 1: Анализ рынков (без торговли)

**Цель:** Получить список всех доступных рынков с базовой информацией.

```bash
GET /api/markets/analyze
```

**Параметры:**
- `limit` (optional) - количество рынков (default: 100)
- `offset` (optional) - смещение для пагинации

**Response:**
```json
{
  "success": true,
  "count": 100,
  "markets": [
    {
      "condition_id": "0x123...",
      "question": "Will Bitcoin reach $100k by 2025?",
      "description": "Market description...",
      "category": "crypto",
      "tokens": {
        "yes": { "price": 0.75, "token_id": "0xabc..." },
        "no": { "price": 0.25, "token_id": "0xdef..." }
      },
      "end_date_iso": "2025-01-01T00:00:00Z",
      "resolution_source": "https://polymarket.com/...",
      "active": true,
      "accepting_orders": true,
      "neg_risk": false,
      "liquidity": {
        "total": 5000,
        "spread": 0.02
      }
    }
  ]
}
```

---

### Этап 2: Фильтрация по показателям

**Цель:** Отфильтровать рынки по вашим критериям.

```bash
POST /api/markets/filter
```

**Body:**
```json
{
  "markets": ["0x123...", "0x456..."],  // Опционально: конкретные markets
  "filters": {
    "minPrice": 0.70,           // Минимальная цена YES
    "maxPrice": 0.99,           // Максимальная цена YES
    "minLiquidity": 1000,       // Минимальная ликвидность (USDC)
    "maxSpread": 0.05,          // Максимальный спред (5%)
    "categories": ["crypto", "politics"],  // Включить категории
    "excludeCategories": ["sports"],       // Исключить категории
    "excludeNegRisk": true,     // Исключить NegRisk
    "minDaysToResolution": 1,   // Минимум дней до разрешения
    "maxDaysToResolution": 30   // Максимум дней до разрешения
  }
}
```

**Response:**
```json
{
  "success": true,
  "filtered_count": 15,
  "markets": [
    {
      "condition_id": "0x123...",
      "question": "Will Bitcoin reach $100k by 2025?",
      "matches": {
        "price": true,
        "liquidity": true,
        "spread": true,
        "category": true
      }
    }
  ]
}
```

---

### Этап 3: Детали рынка + AI оценка

**Цель:** Получить полную информацию о рынке и AI оценку.

#### 3.1 Получить детали рынка

```bash
GET /api/markets/:conditionId
```

**Response:**
```json
{
  "success": true,
  "market": {
    "condition_id": "0x123...",
    "question": "Will Bitcoin reach $100k by 2025?",
    "description": "Full market description...",
    "category": "crypto",
    "tags": ["bitcoin", "crypto", "price"],
    "tokens": {
      "yes": {
        "token_id": "0xabc...",
        "price": 0.75,
        "pricePercent": "75%"
      },
      "no": {
        "token_id": "0xdef...",
        "price": 0.25,
        "pricePercent": "25%"
      }
    },
    "resolution": {
      "end_date": "2025-01-01T00:00:00Z",
      "source": "https://polymarket.com/...",
      "method": "Manual resolution by Polymarket team",
      "criteria": "Bitcoin price must reach exactly $100,000 USD on Coinbase"
    },
    "liquidity": {
      "total": 5000,
      "spread": 0.02,
      "spreadPercent": "2%",
      "orderbook": {
        "yes": {
          "bids": [
            { "price": 0.74, "size": 100 },
            { "price": 0.73, "size": 200 }
          ],
          "asks": [
            { "price": 0.76, "size": 150 },
            { "price": 0.77, "size": 100 }
          ]
        }
      }
    },
    "status": {
      "active": true,
      "accepting_orders": true,
      "closed": false
    }
  }
}
```

#### 3.2 Получить AI оценку

```bash
POST /api/markets/:conditionId/ai-analysis
```

**Body (опционально):**
```json
{
  "useNews": true,        // Использовать новости (SerpAPI)
  "useDeepAnalysis": true // Использовать Tavily для глубокого анализа
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "shouldTrade": true,
    "confidence": 0.85,
    "attractiveness": 0.78,
    "estimatedProbability": 0.82,
    "marketPrice": 0.75,
    "edge": 0.07,  // 7 percentage points
    "riskLevel": "medium",
    "riskFactors": [
      "High volatility in crypto markets",
      "Uncertain regulatory environment"
    ],
    "opportunities": [
      "Strong technical indicators",
      "Positive market sentiment"
    ],
    "reasoning": "Based on current market conditions and technical analysis...",
    "sources": [
      "https://news.example.com/article1",
      "https://news.example.com/article2"
    ],
    "metadata": {
      "analysisDate": "2024-11-05T10:00:00Z",
      "newsCount": 5,
      "deepAnalysisUsed": true
    }
  }
}
```

---

### Этап 4: Вход в рынок (ручной)

**Цель:** Разместить ордер на конкретную сумму.

#### 4.1 Создать ордер

```bash
POST /api/positions/create-order
```

**Body:**
```json
{
  "condition_id": "0x123...",
  "outcome": "Yes",        // "Yes" или "No"
  "side": "BUY",           // "BUY" или "SELL"
  "size": 100,              // Размер в USDC
  "price": 0.75,            // Опционально: конкретная цена (если не указано - market price)
  "orderType": "LIMIT"      // "LIMIT" или "MARKET"
}
```

**Response:**
```json
{
  "success": true,
  "order": {
    "id": "0xorder123...",
    "condition_id": "0x123...",
    "outcome": "Yes",
    "side": "BUY",
    "price": 0.75,
    "size": 100,
    "status": "open",
    "created_at": "2024-11-05T10:00:00Z"
  }
}
```

#### 4.2 Проверить статус ордера

```bash
GET /api/positions/orders/:orderId
```

**Response:**
```json
{
  "success": true,
  "order": {
    "id": "0xorder123...",
    "status": "filled",
    "filled_size": 100,
    "filled_price": 0.75,
    "created_at": "2024-11-05T10:00:00Z",
    "filled_at": "2024-11-05T10:00:05Z"
  }
}
```

#### 4.3 Получить все ордера

```bash
GET /api/positions/orders/all?status=all&limit=50
```

**Query params:**
- `status` (optional) - 'open', 'filled', 'all' (default: 'all')
- `limit` (optional) - количество ордеров (default: 50)

---

## 🔒 Безопасность

### ✅ Что НЕ запускается автоматически:

1. ❌ **Никакие стратегии не запускаются** при старте API сервера
2. ❌ **Никакие боты не торгуют автоматически** (`bot-ai.ts`, `index.ts` не запускаются)
3. ❌ **Никакие ордера не создаются** без явного запроса через API

### ✅ Что запускается:

1. ✅ **Только API сервер** (`npm run start:api`)
2. ✅ **Только чтение данных** (GET endpoints)
3. ✅ **Только ручные действия** (POST endpoints по вашему запросу)

---

## 📊 Пример полного workflow

### 1. Запустить API сервер

```bash
npm run start:api
```

### 2. Проанализировать рынки

```bash
curl http://localhost:3000/api/markets/analyze?limit=50
```

### 3. Отфильтровать по критериям

```bash
curl -X POST http://localhost:3000/api/markets/filter \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "minPrice": 0.80,
      "maxPrice": 0.95,
      "minLiquidity": 2000,
      "categories": ["crypto", "politics"]
    }
  }'
```

### 4. Получить детали интересного рынка

```bash
curl http://localhost:3000/api/markets/0x123...
```

### 5. Получить AI оценку

```bash
curl -X POST http://localhost:3000/api/markets/0x123.../ai-analysis \
  -H "Content-Type: application/json" \
  -d '{
    "useNews": true,
    "useDeepAnalysis": true
  }'
```

### 6. Войти в рынок (если решение принято)

```bash
curl -X POST http://localhost:3000/api/positions/create-order \
  -H "Content-Type: application/json" \
  -d '{
    "condition_id": "0x123...",
    "outcome": "Yes",
    "side": "BUY",
    "size": 100,
    "price": 0.75
  }'
```

### 7. Проверить статус ордера

```bash
curl http://localhost:3000/api/positions/orders/0xorder123...
```

### 8. Получить все ордера

```bash
curl http://localhost:3000/api/positions/orders/all?status=all
```

---

## 🚀 Реализация

### Новые endpoints для добавления:

1. **Markets Controller:**
   - `GET /api/markets/analyze` - анализ рынков
   - `POST /api/markets/filter` - фильтрация
   - `GET /api/markets/:conditionId` - детали рынка
   - `POST /api/markets/:conditionId/ai-analysis` - AI оценка

2. **Positions Controller (расширен):**
   - `POST /api/positions/create-order` - создать ордер
   - `GET /api/positions/orders/:orderId` - статус ордера
   - `GET /api/positions/orders/all` - список всех ордеров (открытые + заполненные)

### Файлы для создания:

- `src/api/controllers/markets.controller.ts` - контроллер для рынков
- `src/api/controllers/positions.controller.ts` - расширен контроллер для позиций (добавлено создание ордеров)
- `src/api/routes/markets.routes.ts` - роуты для рынков
- `src/api/routes/positions.routes.ts` - обновлены роуты для позиций

---

## ⚠️ Важно

1. **API сервер НЕ запускает стратегии** - только предоставляет endpoints
2. **Все действия вручную** - через API запросы
3. **Можно безопасно деплоить** - ничего не будет торговать автоматически
4. **Swagger UI** доступен по `/api-docs` для тестирования

