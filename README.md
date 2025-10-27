# Polymarket Bot

TypeScript бот для взаимодействия с контрактами Polymarket на блокчейне Polygon.

## 🚀 Возможности

- ✅ Управление кошельком Ethereum/Polygon
- ✅ Взаимодействие с контрактами Polymarket
- ✅ Работа с Conditional Tokens
- ✅ Управление позициями в рынках
- ✅ Торговля токенами позиций
- ✅ Полная типизация TypeScript

## 📋 Требования

- Node.js >= 18.0.0
- npm или yarn
- Приватный ключ Ethereum кошелька
- USDC на Polygon для торговли

## 🛠 Установка

1. **Клонируйте репозиторий:**
```bash
git clone <repository-url>
cd polymarket_bot
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

# Gas Configuration
GAS_LIMIT=500000
GAS_PRICE_GWEI=30

# Bot Configuration
MAX_SLIPPAGE_PERCENT=5
MIN_BALANCE_ETH=0.01
```

## 🏃‍♂️ Запуск

### Разработка
```bash
npm run dev
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
│   └── PolymarketService.ts  # Сервис для работы с Polymarket
├── types/
│   └── index.ts              # TypeScript типы
├── utils/
│   └── constants.ts          # Константы и настройки
└── index.ts                  # Основной файл приложения
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

Методы для работы с Polymarket:

```typescript
// Получить баланс USDC
const usdcBalance = await polymarketService.getCollateralBalance();

// Одобрить расходование USDC
await polymarketService.approveCollateral('100');

// Получить баланс позиции
const positionBalance = await polymarketService.getPositionBalance(conditionId, outcomeIndex);

// Разделить позицию
await polymarketService.splitPosition(parentCollectionId, conditionId, partition, amount);

// Объединить позиции
await polymarketService.mergePositions(parentCollectionId, conditionId, partition, amount);
```

## 🔐 Безопасность

⚠️ **ВАЖНО:**
- Никогда не коммитьте файл `.env` в репозиторий
- Храните приватный ключ в безопасном месте
- Используйте отдельный кошелек для торговли
- Проверяйте адреса контрактов перед использованием

## 🌐 Сети

Проект настроен для работы с:
- **Polygon Mainnet** (Chain ID: 137) - основная сеть
- **Ethereum Mainnet** (Chain ID: 1) - для тестирования

## 📊 Контракты Polymarket

Основные контракты на Polygon:
- **ConditionalTokens**: `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`
- **USDC**: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`

## 🐛 Отладка

Для отладки используйте:
```bash
# Запуск с подробным логированием
DEBUG=* npm run dev

# Проверка подключения к сети
npm run dev -- --check-connection
```

## 📝 Примеры использования

### Проверка баланса
```typescript
const bot = new PolymarketBot();
await bot.initialize();
await bot.getWalletInfo();
```

### Одобрение USDC
```typescript
await bot.approveUSDC('1000'); // Одобрить расходование 1000 USDC
```

### Работа с позициями
```typescript
// Получить баланс позиции
const balance = await polymarketService.getPositionBalance(conditionId, 0);

// Перевести позицию
await polymarketService.transferPosition(to, conditionId, 0, '100');
```

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
