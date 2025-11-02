# Polymarket Trading Bot

Автоматизированный бот для торговли на Polymarket с Endgame стратегией.

## Быстрый старт

```bash
npm install
```

Создайте `.env` на основе `.env.example`:
- `PK` - приватный ключ (без 0x)
- `FUNDER_ADDRESS` - публичный адрес кошелька
- `ALCHEMY_API_KEY` - RPC provider
- `SIGNATURE_TYPE=0` - для обычного кошелька

Проверьте балансы:
```bash
npm run check-balance
```

Требуется MATIC (минимум 0.1) и USDC.e (минимум 10).

Тестовая торговля:
```bash
npm run trade
```

## Основные команды

**Торговля:**
- `npm start` - запуск Endgame бота
- `npm run test:endgame` - анализ возможностей
- `npm run start:api` - REST API сервер (мониторинг позиций)

**Утилиты:**
- `npm run positions` - проверка текущих позиций
- `npm run check-balance` - проверка балансов
- `npm run test:liquidity` - проверка ликвидности рынков

## Важно

- **VPN обязателен** - CLOB API недоступен без VPN
- **USDC.e (Bridged)** - адрес `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- **Allowance** - устанавливается автоматически при первом запуске

## Документация

Полная документация в [docs/README.md](docs/README.md)

## Troubleshooting

**ECONNRESET** - включите VPN

**not enough balance / allowance** - запустите `npm run trade`

**Could not create api key** - установите `SIGNATURE_TYPE=0`

**Все рынки $0 объем** - API не возвращает volume, используйте `npm run test:liquidity`
