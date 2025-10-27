# Polymarket Bot

TypeScript бот для взаимодействия с Polymarket через официальный CLOB API на блокчейне Polygon.

## 🚀 Возможности

- ✅ Управление кошельком Ethereum/Polygon
- ✅ Интеграция с официальным Polymarket CLOB API
- ✅ Получение данных о рынках и ордербуках
- ✅ Создание и управление ордерами
- ✅ Получение истории сделок и цен
- ✅ Работа с Conditional Tokens Framework
- ✅ Полная типизация TypeScript

## 📋 Требования

- Node.js >= 18.0.0
- npm или yarn
- Приватный ключ Ethereum кошелька
- USDC на Polygon для торговли

## 🛠 Установка

1. **Клонируйте репозиторий:**
```bash
git clone https://github.com/vlprosvirkin/polymarket-bot.git
cd polymarket_bot/old
```

2. **Установите зависимости:**
```bash
npm install
```

3. **Настройте переменные окружения:**
```bash
cp .env.example .env
```

4. **Отредактируйте `.env` файл:**
```env
# Ethereum Network Configuration
RPC_URL=https://polygon-rpc.com
CHAIN_ID=137

# Wallet Configuration
PRIVATE_KEY=your_private_key_here
WALLET_ADDRESS=your_wallet_address_here

# Polymarket Contract Addresses
POLYMARKET_CONDITIONAL_TOKENS=0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
POLYMARKET_COLLATERAL_TOKEN=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174

# CLOB API Configuration
CLOB_API_URL=https://clob.polymarket.com

# Gas Configuration
GAS_LIMIT=500000
GAS_PRICE_GWEI=30

# Bot Configuration
MAX_SLIPPAGE_PERCENT=5
MIN_BALANCE_ETH=0.01
```

## 🏃‍♂️ Запуск

### Основной бот
```bash
npm run dev
```

### Примеры использования
```bash
npm run examples
```

### Реальный тест с кошельком (ВНИМАНИЕ: использует реальные средства!)
```bash
npm run real-test
```

### Сборка и запуск
```bash
npm run build
npm start
```

## 📁 Структура проекта

```
src/
├── services/
│   ├── WalletService.ts      # Сервис для работы с кошельком
│   └── PolymarketService.ts  # Сервис для работы с Polymarket CLOB API
├── types/
│   └── index.ts              # TypeScript типы и интерфейсы
├── utils/
│   └── constants.ts          # Константы и настройки
├── index.ts                  # Основной файл приложения
└── examples.ts               # Примеры использования
```

## 🔧 API

### WalletService

Основные методы для работы с кошельком:

```typescript
// Получить адрес кошелька
const address = walletService.getAddress();

// Получить баланс ETH
const balance = await walletService.getBalance();

// Получить баланс токена
const tokenBalance = await walletService.getTokenBalance(tokenAddress);

// Отправить транзакцию
const tx = await walletService.sendTransaction(to, value, data);
```

### PolymarketService

Методы для работы с Polymarket CLOB API:

```typescript
// Получить список рынков
const markets = await polymarketService.getMarkets();

// Получить упрощенный список рынков
const simplifiedMarkets = await polymarketService.getSimplifiedMarkets();

// Получить информацию о рынке
const market = await polymarketService.getMarket(conditionId);

// Получить ордербук
const orderbook = await polymarketService.getOrderBook(tokenId);

// Получить размер тика
const tickSize = await polymarketService.getTickSize(tokenId);

// Получить комиссию
const feeRate = await polymarketService.getFeeRate(tokenId);

// Получить среднюю цену
const midpoint = await polymarketService.getMidpoint(tokenId);

// Получить спред
const spread = await polymarketService.getSpread(tokenId);

// Получить последнюю цену сделки
const lastPrice = await polymarketService.getLastTradePrice(tokenId);

// Получить историю цен
const priceHistory = await polymarketService.getPriceHistory({
  tokenID: tokenId,
  startTime: startTime,
  endTime: endTime,
  interval: '1h'
});

// Создать ордер
const order = await polymarketService.createOrder({
  tokenID: tokenId,
  price: 0.5,
  size: 1000000,
  side: 'BUY',
  orderType: 'GTC'
});

// Получить ордер по ID
const order = await polymarketService.getOrder(orderId);

// Получить открытые ордера
const orders = await polymarketService.getOpenOrders({ limit: 10 });

// Получить историю сделок
const trades = await polymarketService.getTrades({ limit: 10 });

// Получить баланс и allowance
const balance = await polymarketService.getBalanceAndAllowance(tokenId);
```

## 🔐 Безопасность

⚠️ **ВАЖНО:**
- Никогда не коммитьте файл `.env` в репозиторий
- Храните приватный ключ в безопасном месте
- Используйте отдельный кошелек для торговли
- Проверяйте адреса контрактов перед использованием
- Тестируйте на небольших суммах

## 🌐 Сети

Проект настроен для работы с:
- **Polygon Mainnet** (Chain ID: 137) - основная сеть
- **Ethereum Mainnet** (Chain ID: 1) - для тестирования

## 📊 Контракты Polymarket

Основные контракты на Polygon:
- **ConditionalTokens**: `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`
- **USDC**: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- **Proxy Wallet**: `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`

## 🐛 Отладка

Для отладки используйте:
```bash
# Запуск с подробным логированием
DEBUG=* npm run dev

# Проверка подключения к сети
npm run dev -- --check-connection
```

## 📝 Примеры использования

### Получение данных о рынках
```typescript
const bot = new PolymarketBot();
await bot.initialize();

// Получить список активных рынков
const markets = await polymarketService.getMarkets();
console.log('Активные рынки:', markets.results);

// Получить информацию о конкретном рынке
const market = await polymarketService.getMarket(conditionId);
console.log('Информация о рынке:', market);
```

### Работа с ордербуками
```typescript
// Получить ордербук
const orderbook = await polymarketService.getOrderBook(tokenId);
console.log('Лучшие цены:', {
  bestBid: orderbook?.bids[0]?.price,
  bestAsk: orderbook?.asks[0]?.price
});

// Получить детали рынка
const [tickSize, feeRate, midpoint] = await Promise.all([
  polymarketService.getTickSize(tokenId),
  polymarketService.getFeeRate(tokenId),
  polymarketService.getMidpoint(tokenId)
]);
```

### Создание ордера
```typescript
const orderParams = {
  tokenID: tokenId,
  price: 0.6,
  size: 1000000, // 1 USDC
  side: 'BUY' as const,
  orderType: 'GTC' as const
};

const order = await polymarketService.createOrder(orderParams);
console.log('Ордер создан:', order);
```

### Получение истории
```typescript
// История сделок
const trades = await polymarketService.getTrades({ limit: 10 });
console.log('Последние сделки:', trades);

// История цен
const priceHistory = await polymarketService.getPriceHistory({
  tokenID: tokenId,
  startTime: startTime,
  endTime: endTime,
  interval: '1h'
});
console.log('История цен:', priceHistory);
```

## 📚 Официальная документация

- [Polymarket Developer Documentation](https://docs.polymarket.com/)
- [CLOB API Reference](https://docs.polymarket.com/central-limit-order-book/clob-introduction)
- [Conditional Tokens Framework](https://docs.polymarket.com/conditional-token-frameworks/overview)
- [GitHub Repository](https://github.com/polymarket)

## 🤝 Вклад в проект

1. Форкните репозиторий
2. Создайте ветку для новой функции
3. Внесите изменения
4. Создайте Pull Request

## 📄 Лицензия

MIT License

## ⚠️ Отказ от ответственности

Этот бот предназначен для образовательных целей. Используйте на свой страх и риск. Авторы не несут ответственности за возможные потери средств.

## 🔗 Полезные ссылки

- [Polymarket Documentation](https://docs.polymarket.com/)
- [Polygon Documentation](https://docs.polygon.technology/)
- [Ethers.js Documentation](https://docs.ethers.org/)
- [Conditional Tokens Framework](https://github.com/gnosis/conditional-tokens-contracts)
