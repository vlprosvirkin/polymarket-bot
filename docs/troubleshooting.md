# Troubleshooting

Решение частых проблем и ошибок.

## Частые проблемы

### ECONNRESET / Сетевые ошибки

**Симптомы:**
```
Error: connect ECONNRESET
Error: getaddrinfo ENOTFOUND
```

**Решение:**
1. Включите VPN — CLOB API недоступен из некоторых регионов
2. Проверьте интернет-соединение
3. Попробуйте другой VPN сервер

### Недостаточно баланса / allowance

**Симптомы:**
```
Error: not enough balance
Error: insufficient allowance
```

**Решение:**
1. Проверьте балансы:
   ```bash
   npm run check-balance
   ```

2. Убедитесь, что есть:
   - Минимум 0.1 MATIC для gas
   - Минимум 10 USDC.e для торговли

3. Установите allowance:
   ```bash
   npm run trade
   ```

4. Пополните баланс USDC.e:
   - Адрес: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
   - Используйте мост или DEX для конвертации

### Could not create api key

**Симптомы:**
```
Error: Could not create api key
```

**Решение:**
1. Установите `SIGNATURE_TYPE=0` в `.env`:
   ```bash
   SIGNATURE_TYPE=0
   ```

2. Проверьте формат приватного ключа:
   - Должен быть БЕЗ префикса `0x`
   - Пример: `abc123...` (не `0xabc123...`)

3. Перезапустите бота

### Все рынки показывают $0 volume

**Симптомы:**
- API не возвращает volume для рынков
- Все рынки имеют volume = 0

**Решение:**
1. Это нормальное поведение — Polymarket API не всегда возвращает volume
2. Используйте ликвидность из orderbook:
   ```bash
   npm run test:liquidity
   ```
3. MarketFilter автоматически использует ликвидность вместо volume

### Database not available

**Симптомы:**
```
Error: Database not available
Error: Connection refused
```

**Решение:**
1. Проверьте `DATABASE_URL` в `.env`:
   ```bash
   DATABASE_URL=postgres://user:password@host:5432/polymarketdb
   ```

2. Убедитесь, что база данных доступна:
   ```bash
   psql $DATABASE_URL -c "SELECT 1;"
   ```

3. Примените миграции:
   ```bash
   npm run db:migrate
   ```

4. Если база не нужна, можно работать без неё (некоторые функции будут недоступны)

### AI анализ не работает

**Симптомы:**
- AI стратегия не анализирует рынки
- Ошибки при вызове AI API

**Решение:**
1. Проверьте API ключи:
   ```bash
   # OpenAI
   OPENAI_API_KEY=sk-...
   
   # Или Gemini
   GEMINI_API_KEY=...
   ```

2. Проверьте баланс API ключа:
   - OpenAI: https://platform.openai.com/account/billing
   - Gemini: https://makersuite.google.com/app/apikey

3. Проверьте лимиты:
   ```bash
   npm run test:ai-filter
   ```

4. Убедитесь, что ключ правильный (без пробелов, правильный формат)

### MCP серверы не подключаются

**Симптомы:**
- Event Agents не могут подключиться к MCP серверам
- Ошибки "MCP SDK not installed" или "MCP connection failed"

**Решение:**
1. Установите MCP SDK:
   ```bash
   npm install @modelcontextprotocol/sdk
   ```

2. Проверьте статус MCP реестра:
   ```bash
   npm run test:mcp
   ```

3. Проверьте API ключи для MCP серверов:
   ```bash
   # Для Tavily
   TAVILY_API_KEY=...
   
   # Для Brave Search
   BRAVE_API_KEY=...
   
   # Для Alpha Vantage
   ALPHAVANTAGE_API_KEY=...
   ```

4. Убедитесь, что сервер доступен:
   - Проверьте интернет-соединение
   - Некоторые серверы требуют VPN

5. Проверьте логи агента:
   ```typescript
   const agent = new SportsAgent();
   await agent.initializeMCPServers();
   agent.printMCPStatus(); // Покажет статус подключений
   ```

### Event Agents не работают

**Симптомы:**
- Агенты не анализируют рынки
- Ошибки при вызове агентов

**Решение:**
1. Проверьте, что агент правильно определен:
   ```typescript
   const registry = getAgentRegistry();
   const agent = registry.getAgentForMarket(market);
   if (!agent) {
       console.log('No agent found for this market');
   }
   ```

2. Проверьте категоризацию рынка:
   - Агенты работают только с определенными категориями
   - SportsAgent: sports, nba, nfl, etc.
   - PoliticsAgent: politics, election, etc.
   - CryptoAgent: crypto, bitcoin, ethereum, etc.

3. Проверьте MCP подключения:
   ```typescript
   const servers = agent.getConnectedMCPServers();
   console.log('Connected servers:', servers);
   ```

4. Проверьте кэш:
   - Результаты кэшируются на 5 минут
   - Попробуйте очистить кэш или подождать

### Telegram уведомления не приходят

**Симптомы:**
- Бот не отправляет сообщения в Telegram
- Ошибки при отправке

**Решение:**
1. Проверьте переменные окружения:
   ```bash
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_CHAT_ID=...
   ```

2. Убедитесь, что бот инициализирован:
   - Должно быть сообщение "✅ Telegram Bot подключен"

3. Проверьте Chat ID:
   - Отправьте сообщение боту
   - Получите Chat ID через: `https://api.telegram.org/bot<TOKEN>/getUpdates`

4. Убедитесь, что бот не заблокирован

### Ошибки при компиляции TypeScript

**Симптомы:**
```
error TS2307: Cannot find module
error TS2322: Type is not assignable
```

**Решение:**
1. Установите зависимости:
   ```bash
   npm install
   ```

2. Проверьте версию TypeScript:
   ```bash
   npx tsc --version
   ```

3. Очистите и пересоберите:
   ```bash
   rm -rf dist node_modules
   npm install
   npm run build
   ```

### Проблемы с ликвидностью

**Симптомы:**
- Рынки не проходят проверку ликвидности
- Ошибки при размещении ордеров

**Решение:**
1. Проверьте ликвидность рынка:
   ```bash
   npm run test:liquidity
   ```

2. Увеличьте минимальную ликвидность в конфиге:
   ```typescript
   MIN_LIQUIDITY: 1000  // Вместо 100
   ```

3. Используйте enriched markets с orderbook:
   ```typescript
   const enriched = await dataService.getEnrichedMarkets({
     includeOrderbook: true,
     includeLiquidity: true
   });
   ```

## Ошибки API

### Rate Limiting

**Симптомы:**
```
Error: Too many requests
Error: 429
```

**Решение:**
1. Уменьшите частоту запросов
2. Добавьте задержки между запросами
3. Используйте кэширование

### Invalid Signature

**Симптомы:**
```
Error: Invalid signature
Error: Signature verification failed
```

**Решение:**
1. Проверьте `SIGNATURE_TYPE=0` в `.env`
2. Убедитесь, что приватный ключ правильный
3. Пересоздайте API ключи:
   ```bash
   npm run create-api-keys
   ```

### Market Not Found

**Симптомы:**
```
Error: Market not found
Error: 404
```

**Решение:**
1. Проверьте, что рынок активен:
   ```bash
   npm run test:api
   ```

2. Убедитесь, что `condition_id` правильный
3. Рынок может быть закрыт или удален

## Проблемы с балансом

### MATIC баланс недостаточен

**Решение:**
1. Пополните MATIC баланс:
   - Используйте мост или DEX
   - Минимум 0.1 MATIC для gas

2. Проверьте баланс:
   ```bash
   npm run check-balance
   ```

### USDC.e баланс недостаточен

**Решение:**
1. Пополните USDC.e баланс:
   - Адрес: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
   - Используйте мост или DEX

2. Установите allowance:
   ```bash
   npm run trade
   ```

3. Проверьте баланс:
   ```bash
   npm run check-balance
   ```

## Проблемы с позициями

### Позиции не закрываются

**Решение:**
1. Проверьте логику закрытия в стратегии
2. Убедитесь, что условия закрытия выполняются
3. Проверьте ликвидность для закрытия

### Ордера не исполняются

**Решение:**
1. Проверьте ликвидность рынка
2. Убедитесь, что цена в допустимом диапазоне
3. Проверьте минимальный размер ордера

## Получение помощи

### Логи

Включите подробное логирование:

```typescript
console.log('[DEBUG]', data);
```

### GitHub Issues

Создайте issue на GitHub с:
- Описанием проблемы
- Логами ошибок
- Шагами для воспроизведения
- Версией Node.js и зависимостей

### Проверка конфигурации

Запустите проверку настроек:

```bash
npm run verify
```

Эта команда проверит:
- Наличие всех необходимых переменных окружения
- Подключение к API
- Балансы
- Конфигурацию стратегий

## Полезные команды для диагностики

```bash
# Проверка балансов
npm run check-balance

# Проверка подключения
npm run test:api

# Проверка ликвидности
npm run test:liquidity

# Проверка позиций
npm run positions

# Проверка настроек
npm run verify

# Статус базы данных
npm run db:status

# Тест MCP реестра
npm run test:mcp
```

