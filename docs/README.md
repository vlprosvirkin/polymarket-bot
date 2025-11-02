# Polymarket Trading Bot

Автоматизированный бот для торговли на Polymarket с Endgame стратегией.

## Быстрый старт

### 1. Установка
```bash
npm install
```

### 2. Настройка .env
Скопируйте `.env.example` и заполните:
- `PK` - приватный ключ (без 0x)
- `FUNDER_ADDRESS` - публичный адрес кошелька
- `ALCHEMY_API_KEY` - RPC provider
- `CHAIN_ID=137` - Polygon
- `SIGNATURE_TYPE=0` - для обычного кошелька

### 3. Проверка балансов
```bash
npm run check-balance
```

Требуется:
- MATIC для gas (минимум 0.1)
- USDC.e для торговли (минимум 10)

USDC.e адрес: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`

### 4. Тестовая торговля
```bash
npm run trade
```

Автоматически установит allowance и разместит тестовый ордер.

## Основные команды

### Торговля
- `npm start` - запуск Endgame бота (demo режим)
- `npm run start:high` - высокая уверенность (90-99%)
- `npm run trade` - тестовая торговля

### Тесты
- `npm run test:api` - проверка подключения к API
- `npm run test:endgame` - анализ возможностей Endgame
- `npm run test:liquidity` - проверка ликвидности рынков
- `npm run test:volume` - отладка структуры API данных
- `npm run test:high` - high confidence стратегия (опционально)

Подробнее: [docs/tests.md](tests.md)

### Утилиты
- `npm run check-balance` - проверка MATIC и USDC.e
- `npm run verify` - проверка настроек
- `npm run generate-wallet` - создать новый кошелек

## Стратегия Endgame

Endgame - хедж-стратегия для рынков с высокой вероятностью близких к разрешению.

### Принцип работы
1. Находит рынки 80-99% вероятности близкие к дате разрешения
2. Покупает YES по высокой цене (например 0.95)
3. Размещает страховочный NO ордер
4. При разрешении YES получает фиксированную прибыль

### Параметры стратегии
- `minProbability` - минимальная вероятность (80-99%)
- `maxDaysToResolution` - дней до разрешения
- `minVolume` - минимальный объем рынка
- `orderSize` - размер позиции в USDC
- `maxAcceptableLoss` - максимальный убыток при неудаче

### Фильтры
- Вероятность 80-99%
- Наличие даты разрешения
- Минимальная ликвидность (через orderbook)
- Активные рынки

## Важно

### VPN обязателен
CLOB API недоступен без VPN. Используйте любую локацию кроме US.

### USDC.e (Bridged)
Polymarket использует USDC.e, НЕ Native USDC.

### Signature Type
- `SIGNATURE_TYPE=0` для MetaMask/обычного кошелька
- `SIGNATURE_TYPE=1` для Magic/Email login

### Allowance
Автоматически устанавливается при первом запуске `npm run trade` или `npm start`.

## Архитектура

### Структура файлов
```
src/
├── strategies/
│   └── EndgameStrategy.ts     # Endgame стратегия
├── services/
│   └── PolymarketDataService.ts  # Агрегация данных API
├── test/                      # Тесты и анализаторы
└── index.ts                   # Основной бот
```

### Сервисы
- **PolymarketDataService** - получает рынки, orderbook, рассчитывает ликвидность
- **EndgameStrategy** - фильтрует рынки, анализирует хеджи, размещает ордера

### Важные адреса
- USDC.e: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- CTF Exchange: `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`
- NegRisk Exchange: `0xC5d563A36AE78145C45a50134d48A1215220f80a`

## Troubleshooting

### ECONNRESET
Включите VPN.

### Could not create api key
Установите `SIGNATURE_TYPE=0` для обычного кошелька.

### not enough balance / allowance
Запустите `npm run trade` для автоматической установки allowance.

### Gas price below minimum
Используйте последнюю версию - gas рассчитывается автоматически.

### Все рынки показывают $0 объем
API `getSamplingMarkets()` не возвращает volume. Используйте `npm run test:liquidity` для проверки реальной ликвидности через orderbook.

## Полезные ресурсы

- [Polymarket CLOB Docs](https://docs.polymarket.com/developers/CLOB/introduction)
- [CLOB Client GitHub](https://github.com/Polymarket/clob-client)
- [Polymarket Examples](https://github.com/Polymarket/examples)
