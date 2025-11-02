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
- `SIGNATURE_TYPE=0` - для обычного кошелька

### 3. Проверка и запуск
```bash
npm run check-balance    # Проверка MATIC и USDC.e
npm run trade           # Тестовая торговля (устанавливает allowance)
npm run test:endgame    # Анализ возможностей
npm start               # Запуск бота (demo режим)
```

## Команды

### Основные
- `npm start` - запуск Endgame бота
- `npm run test:endgame` - анализ возможностей

### Тесты ([подробнее](tests.md))
- `npm run test:api` - проверка подключения к API
- `npm run test:liquidity` - проверка ликвидности рынков
- `npm run test:volume` - отладка структуры API данных

### Утилиты
- `npm run positions` - проверка текущих позиций (ордера, сделки, балансы)
- `npm run check-balance` - проверка балансов MATIC и USDC.e
- `npm run trade` - тестовая торговля

## Стратегия Endgame

Хедж-стратегия для рынков 95-99% вероятности близких к разрешению.

**Принцип:**
1. Покупка большой позиции в YES (основная ставка)
2. Покупка страховки в NO (хедж от черного лебедя)
3. При YES выигрывает → прибыль 1-5%
4. При NO выигрывает → убыток ограничен 10-20% (вместо 100%)

**Пример:** YES @ 97%, капитал $100
- YES: 103 токена @ $0.97 = $99.91
- NO: 83 токена @ $0.03 = $2.49 (страховка)
- Прибыль при успехе: +$0.60 (0.6%)
- Убыток при неудаче: -$19.40 (защита хеджем)

**Подробнее:** [endgame-strategy.md](endgame-strategy.md)

## Архитектура

### Структура
```
src/
├── strategies/
│   └── EndgameStrategy.ts          # Endgame стратегия
├── services/
│   └── PolymarketDataService.ts    # Агрегация API данных
├── test/                           # Тесты и анализаторы
└── index.ts                        # Основной бот
```

### Сервисы
- **PolymarketDataService** - получение рынков, orderbook, расчет ликвидности ([api-service.md](api-service.md))
- **EndgameStrategy** - фильтрация рынков, анализ хеджей, размещение ордеров

### Важные адреса
- USDC.e: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- CTF Exchange: `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`

## Требования

- Node.js >= 16
- MATIC для gas (минимум 0.1)
- USDC.e для торговли (минимум 10)
- VPN (CLOB API недоступен без VPN)

## Troubleshooting

**ECONNRESET** - включите VPN

**not enough balance / allowance** - запустите `npm run trade`

**Could not create api key** - установите `SIGNATURE_TYPE=0`

**Все рынки $0 объем** - API не возвращает volume, используйте `npm run test:liquidity`

## Ресурсы

- [Polymarket CLOB Docs](https://docs.polymarket.com/developers/CLOB/introduction)
- [CLOB Client GitHub](https://github.com/Polymarket/clob-client)
