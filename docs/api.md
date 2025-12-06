# REST API для мониторинга позиций

REST API для получения информации о позициях, ордерах и сделках в реальном времени.

**⚠️ Безопасный режим:** API сервер работает в безопасном режиме - никакие стратегии не запускаются автоматически. Все действия выполняются вручную через API endpoints. См. [Безопасный Workflow](safe-trading-workflow.md) для подробностей.

## Запуск API сервера

```bash
npm run start:api
```

Сервер запустится на `http://localhost:3000` (порт можно изменить в `.env` через `API_PORT`)

**Swagger UI**: После запуска доступен по адресу `http://localhost:3000/api-docs`

## Endpoints

### GET /health
Проверка здоровья сервера.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-11-02T20:00:00.000Z",
  "uptime": 123.45
}
```

---

### GET /
Информация об API и список endpoints.

**Response:**
```json
{
  "name": "Polymarket Bot API",
  "version": "1.0.0",
  "endpoints": {
    "health": "GET /health",
    "positions": {
      "orders": "GET /api/positions/orders",
      "trades": "GET /api/positions/trades?limit=20",
      "active": "GET /api/positions/active",
      "balance": "GET /api/positions/balance",
      "summary": "GET /api/positions/summary",
      "cancelOrder": "DELETE /api/positions/orders/:orderId",
      "cancelAll": "DELETE /api/positions/orders"
    }
  }
}
```

---

## Positions Endpoints

### GET /api/positions/orders
Получить все открытые ордера.

**Response:**
```json
{
  "success": true,
  "count": 2,
  "orders": [
    {
      "id": "0x123...",
      "market": "0xabc...",
      "outcome": "Yes",
      "side": "BUY",
      "price": 0.95,
      "pricePercent": "95.00%",
      "size": 100,
      "sizeMatched": 0,
      "created": "2024-11-02T19:00:00.000Z",
      "status": "open"
    }
  ]
}
```

---

### GET /api/positions/trades?limit=20
Получить историю сделок.

**Query params:**
- `limit` (optional) - количество сделок (по умолчанию 20)

**Response:**
```json
{
  "success": true,
  "count": 5,
  "trades": [
    {
      "id": "0x456...",
      "market": "0xabc...",
      "outcome": "Yes",
      "side": "BUY",
      "price": 0.97,
      "pricePercent": "97.00%",
      "size": 50,
      "feeRateBps": 200,
      "feePercent": "2.00%",
      "timestamp": 1699000000000,
      "date": "2024-11-02T18:30:00.000Z"
    }
  ]
}
```

---

### GET /api/positions/active
Получить активные позиции (рассчитанные из сделок).

**Response:**
```json
{
  "success": true,
  "count": 1,
  "positions": [
    {
      "market": "0xabc...",
      "outcome": "Yes",
      "tokenId": "0x789...",
      "netSize": 50,
      "buySize": 100,
      "sellSize": 50,
      "avgPrice": 95.5,
      "totalCost": 95.5,
      "trades": 3,
      "status": "long"
    }
  ]
}
```

**Поля:**
- `netSize` - чистая позиция (buySize - sellSize)
- `avgPrice` - средняя цена покупки (в процентах)
- `totalCost` - общая стоимость в USDC
- `status` - "long" (netSize > 0) или "short" (netSize < 0)

---

### GET /api/positions/balance
Получить USDC баланс и allowance.

**Response:**
```json
{
  "success": true,
  "balance": {
    "usdc": 1000.50,
    "allowance": 50000.00,
    "raw": {
      "balance": "1000500000",
      "allowance": "50000000000"
    }
  }
}
```

---

### GET /api/positions/summary
Получить полную сводку (все данные).

**Response:**
```json
{
  "success": true,
  "summary": {
    "openOrders": 2,
    "activePositions": 1,
    "recentTrades": 10,
    "balance": 1000.50,
    "totalExposure": 95.50
  },
  "details": {
    "orders": [
      {
        "market": "0xabc...",
        "side": "BUY",
        "price": "95.00%"
      }
    ],
    "positions": [
      {
        "market": "0xabc...",
        "outcome": "Yes",
        "netSize": 50,
        "totalCost": 95.50
      }
    ]
  }
}
```

**Поля summary:**
- `totalExposure` - сумма всех активных позиций по стоимости

---

### DELETE /api/positions/orders/:orderId
Отменить конкретный ордер.

**Params:**
- `orderId` - ID ордера

**Response:**
```json
{
  "success": true,
  "message": "Order 0x123... cancelled"
}
```

---

### DELETE /api/positions/orders
Отменить все открытые ордера.

**Response:**
```json
{
  "success": true,
  "message": "Cancelled 5 orders, 0 failed",
  "cancelled": 5,
  "failed": 0,
  "total": 5
}
```

---

## Примеры использования

### cURL

**Получить сводку:**
```bash
curl http://localhost:3000/api/positions/summary
```

**Получить открытые ордера:**
```bash
curl http://localhost:3000/api/positions/orders
```

**Получить последние 50 сделок:**
```bash
curl http://localhost:3000/api/positions/trades?limit=50
```

**Отменить ордер:**
```bash
curl -X DELETE http://localhost:3000/api/positions/orders/0x123...
```

**Отменить все ордера:**
```bash
curl -X DELETE http://localhost:3000/api/positions/orders
```

---

### JavaScript (fetch)

```javascript
// Получить сводку
const response = await fetch('http://localhost:3000/api/positions/summary');
const data = await response.json();
console.log(data);

// Получить активные позиции
const positions = await fetch('http://localhost:3000/api/positions/active');
const posData = await positions.json();
console.log(posData.positions);

// Отменить все ордера
await fetch('http://localhost:3000/api/positions/orders', {
  method: 'DELETE'
});
```

---

### Python (requests)

```python
import requests

# Получить баланс
response = requests.get('http://localhost:3000/api/positions/balance')
data = response.json()
print(f"USDC Balance: {data['balance']['usdc']}")

# Получить сводку
summary = requests.get('http://localhost:3000/api/positions/summary').json()
print(f"Open Orders: {summary['summary']['openOrders']}")
print(f"Active Positions: {summary['summary']['activePositions']}")
```

---

## Ошибки

При ошибке возвращается:
```json
{
  "success": false,
  "error": "Error message"
}
```

HTTP статусы:
- `200` - успех
- `404` - endpoint не найден
- `500` - ошибка сервера

---

## Конфигурация

### Переменные окружения (.env)

```env
API_PORT=3000  # Порт API сервера (по умолчанию 3000)
```

---

## CORS

API поддерживает CORS, можно делать запросы из браузера с любых доменов.

---

## Автоматическое обновление

Для получения данных в реальном времени можно делать периодические запросы:

```javascript
// Обновление каждые 5 секунд
setInterval(async () => {
  const response = await fetch('http://localhost:3000/api/positions/summary');
  const data = await response.json();
  console.log('Updated:', data.summary);
}, 5000);
```

Или использовать polling для конкретных endpoints:
- `/api/positions/orders` - проверка новых ордеров
- `/api/positions/active` - обновление позиций
- `/api/positions/balance` - текущий баланс

---

## Безопасный Workflow

API сервер поддерживает безопасный workflow для ручной торговли без автоматических стратегий.

**Основные этапы:**
1. Анализ рынков (без торговли)
2. Фильтрация по показателям
3. Детали рынка + AI оценка
4. Вход в рынок (ручной)

Подробнее: [Безопасный Workflow](safe-trading-workflow.md)

### Новые endpoints для безопасного workflow

**Markets:**
- `GET /api/markets/analyze` - анализ рынков
- `POST /api/markets/filter` - фильтрация рынков
- `GET /api/markets/:conditionId` - детали рынка
- `POST /api/markets/:conditionId/ai-analysis` - AI оценка рынка

**Positions (расширенные):**
- `POST /api/positions/create-order` - создать ордер вручную
- `GET /api/positions/orders/:orderId` - статус конкретного ордера
- `GET /api/positions/orders/all` - все ордера (открытые + заполненные)
