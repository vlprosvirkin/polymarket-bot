# Быстрый старт

Это руководство поможет вам быстро настроить и запустить Polymarket Trading Bot.

## Установка

### Требования

- **Node.js** версии 18 или выше
- **npm** или **yarn**
- **VPN** (CLOB API недоступен из некоторых регионов)
- **MATIC** для gas (минимум 0.1 MATIC)
- **USDC.e** для торговли (минимум 10 USDC.e)

### Шаг 1: Клонирование репозитория

```bash
git clone https://github.com/vlprosvirkin/polymarket-bot.git
cd polymarket_bot
```

### Шаг 2: Установка зависимостей

```bash
npm install
```

### Шаг 3: Компиляция TypeScript

```bash
npm run build
```

## Настройка окружения

### Создание .env файла

Скопируйте пример файла окружения:

```bash
cp .env.example .env
```

### Обязательные параметры

Откройте `.env` и настройте следующие параметры:

```bash
# Приватный ключ кошелька (БЕЗ префикса 0x)
PK=ваш_приватный_ключ_без_0x

# Адрес вашего кошелька
FUNDER_ADDRESS=0xВашАдрес

# Chain ID для Polygon
CHAIN_ID=137

# Тип подписи (обязательно 0)
SIGNATURE_TYPE=0
```

### AI провайдер (выберите один)

Для использования AI стратегии нужен один из следующих ключей:

```bash
# OpenAI (рекомендуется)
OPENAI_API_KEY=sk-...

# Или Gemini (альтернатива)
GEMINI_API_KEY=...
```

### Опциональные параметры

Эти параметры улучшают работу AI стратегии и Event Agents:

```bash
# Новости за последние 24 часа (SerpAPI)
SERP_API_KEY=...

# Глубокий анализ топ-рынков (Tavily) - также для MCP
TAVILY_API_KEY=...

# Brave Search API (для MCP Event Agents)
BRAVE_API_KEY=...

# Alpha Vantage API (для финансовых данных через MCP)
ALPHAVANTAGE_API_KEY=...

# CoinGecko Pro API (для крипто данных через MCP)
COINGECKO_PRO_API_KEY=...

# PostgreSQL для хранения данных
DATABASE_URL=postgres://user:password@host:5432/polymarketdb

# Telegram уведомления
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# Порт для REST API (по умолчанию 3001)
API_PORT=3001
```

**MCP (Model Context Protocol):**

Для использования Event Agents с MCP интеграцией установите SDK:

```bash
npm install @modelcontextprotocol/sdk
```

MCP серверы автоматически определяются на основе настроенных API ключей. См. [MCP интеграция](agents-mcp-servers.md) для подробностей.

## Первая торговля

### Шаг 1: Проверка балансов

Убедитесь, что у вас достаточно средств:

```bash
npm run check-balance
```

Вы должны увидеть:
- **MATIC баланс**: минимум 0.1 MATIC
- **USDC.e баланс**: минимум 10 USDC.e

**Важно:** USDC.e адрес на Polygon: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`

### Шаг 2: Тестовая торговля

Выполните тестовую торговлю для установки allowance:

```bash
npm run trade
```

Эта команда:
- Устанавливает allowance для USDC.e
- Выполняет тестовую сделку
- Проверяет подключение к Polymarket API

### Шаг 3: Проверка подключения

Проверьте, что API работает корректно:

```bash
npm run test:api
```

## Запуск бота

### Endgame Strategy (рекомендуется для начала)

Стратегия для рынков с высокой вероятностью (95-99%):

```bash
npm start
```

### AI Strategy

Стратегия с AI анализом и новостями:

```bash
npm run start:ai
```

### High Confidence Strategy

Упрощенная стратегия для высоковероятных рынков:

```bash
npm run start:high
```

### REST API сервер (Безопасный режим)

Запуск API для мониторинга и ручной торговли:

```bash
npm run start:api
```

**⚠️ Важно:** API сервер работает в **безопасном режиме** - никакие стратегии не запускаются автоматически. Все действия выполняются вручную через API endpoints.

После запуска API будет доступен на `http://localhost:3001`
Swagger UI: `http://localhost:3001/api-docs`

Подробнее: [Безопасный Workflow](safe-trading-workflow.md)

## Проверка работы

### Мониторинг позиций

Проверьте текущие позиции и ордера:

```bash
npm run positions
```

### Анализ возможностей

Проверьте доступные возможности для торговли:

```bash
# Endgame возможности
npm run test:endgame

# Анализ ликвидности
npm run test:liquidity
```

## Следующие шаги

1. **Изучите стратегии**: Прочитайте документацию по [Endgame Strategy](endgame-strategy.md) и [AI Strategy](ai-usage.md)
2. **Настройте параметры**: Отредактируйте конфигурацию в `src/core/config.ts`
3. **Настройте мониторинг**: Используйте REST API или Telegram для отслеживания
4. **Изучите Event Agents**: Прочитайте про [Event Agents](agents.md) и [MCP интеграцию](agents-mcp-servers.md)
5. **Безопасный Workflow**: Изучите [Безопасный Workflow](safe-trading-workflow.md) для ручной торговли через API
6. **Изучите архитектуру**: Поймите как работает система в [Архитектура](architecture-bot-vs-strategy.md)

## Troubleshooting

Если возникли проблемы:

1. **ECONNRESET ошибки**: Включите VPN
2. **Недостаточно баланса**: Пополните MATIC и USDC.e
3. **Ошибки API**: Проверьте `SIGNATURE_TYPE=0` в `.env`
4. **AI не работает**: Проверьте API ключи OpenAI/Gemini

Подробнее в разделе [Troubleshooting](troubleshooting.md).

## Важные адреса

- **USDC.e на Polygon**: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- **CTF Exchange**: `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`
- **Polymarket CLOB**: `https://clob.polymarket.com`

## Ресурсы

- [Polymarket CLOB Docs](https://docs.polymarket.com/developers/CLOB/introduction)
- [CLOB Client GitHub](https://github.com/Polymarket/clob-client)
- [Polymarket App](https://polymarket.com)

