import dotenv from 'dotenv';
import { WalletService } from './services/WalletService';
import { PolymarketService } from './services/PolymarketService';
import { CreateOrderParams } from './types';

// Загружаем переменные окружения
dotenv.config();

class PolymarketBot {
  private walletService: WalletService;
  private polymarketService: PolymarketService;

  constructor() {
    try {
      this.walletService = new WalletService();
      this.polymarketService = new PolymarketService(this.walletService);
    } catch (error) {
      console.error('Ошибка инициализации бота:', error);
      process.exit(1);
    }
  }

  /**
   * Инициализация бота
   */
  async initialize(): Promise<void> {
    console.log('🚀 Инициализация Polymarket Bot...');

    try {
      // Проверяем подключение к сети
      const isConnected = await this.walletService.checkConnection();
      if (!isConnected) {
        throw new Error('Не удалось подключиться к сети');
      }

      // Получаем информацию о сети
      const networkInfo = await this.walletService.getNetworkInfo();
      console.log(`📡 Подключено к сети: ${networkInfo.name} (Chain ID: ${networkInfo.chainId})`);

      // Получаем адрес кошелька
      const walletAddress = this.walletService.getAddress();
      console.log(`💰 Адрес кошелька: ${walletAddress}`);

      // Получаем баланс ETH
      const ethBalance = await this.walletService.getBalance();
      console.log(`💎 Баланс ETH: ${ethBalance}`);

      // Получаем баланс USDC
      const usdcBalance = await this.polymarketService.getCollateralBalance();
      console.log(`💵 Баланс USDC: ${usdcBalance}`);

      // Получаем информацию о контрактах
      const contractAddresses = this.polymarketService.getContractAddresses();
      console.log('📋 Адреса контрактов:');
      console.log(`   ConditionalTokens: ${contractAddresses.conditionalTokens}`);
      console.log(`   CollateralToken: ${contractAddresses.collateralToken}`);

      // Проверяем подключение к CLOB API
      const clobConnected = await this.polymarketService.checkConnection();
      console.log(`🔗 CLOB API: ${clobConnected ? 'Подключен' : 'Недоступен'}`);

      // Получаем время сервера
      const serverTime = await this.polymarketService.getServerTime();
      console.log(`🕐 Время сервера: ${new Date(serverTime).toLocaleString()}`);

      console.log('✅ Бот успешно инициализирован!');

    } catch (error) {
      console.error('❌ Ошибка инициализации:', error);
      throw error;
    }
  }

  /**
   * Получить информацию о кошельке
   */
  async getWalletInfo(): Promise<void> {
    console.log('\n📊 Информация о кошельке:');

    const address = this.walletService.getAddress();
    const ethBalance = await this.walletService.getBalance();
    const usdcBalance = await this.polymarketService.getCollateralBalance();
    const allowance = await this.polymarketService.getCollateralAllowance();

    console.log(`   Адрес: ${address}`);
    console.log(`   ETH: ${ethBalance}`);
    console.log(`   USDC: ${usdcBalance}`);
    console.log(`   Allowance: ${allowance}`);
  }

  /**
   * Одобрить расходование USDC
   */
  async approveUSDC(amount: string): Promise<void> {
    console.log(`\n🔐 Одобрение расходования ${amount} USDC...`);

    try {
      const tx = await this.polymarketService.approveCollateral(amount);
      console.log(`   Транзакция отправлена: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`   Транзакция подтверждена в блоке: ${receipt?.blockNumber}`);

    } catch (error) {
      console.error('❌ Ошибка одобрения:', error);
      throw error;
    }
  }

  /**
   * Проверить статус одобрения
   */
  async checkApprovalStatus(): Promise<void> {
    console.log('\n🔍 Проверка статуса одобрения...');

    const allowance = await this.polymarketService.getCollateralAllowance();
    console.log(`   Текущий allowance: ${allowance} USDC`);

    if (parseFloat(allowance) > 0) {
      console.log('✅ Одобрение уже установлено');
    } else {
      console.log('⚠️  Одобрение не установлено');
    }
  }

  /**
   * Демонстрация работы с CLOB API
   */
  async demonstrateClobOperations(): Promise<void> {
    console.log('\n🎯 Демонстрация операций с CLOB API...');

    try {
      // Получение списка рынков
      const marketsResponse = await this.polymarketService.getMarkets();
      console.log(`   Найдено рынков: ${marketsResponse.results.length}`);

      if (marketsResponse.results.length > 0) {
        const firstMarket = marketsResponse.results[0];
        console.log(`   Первый рынок: ${firstMarket.question}`);

        // Получение ордербука для первого токена
        const tokenId = firstMarket.tokenIds?.[0] || firstMarket.id;
        const orderbook = await this.polymarketService.getOrderBook(tokenId);

        if (orderbook) {
          console.log(`   Ордербук: ${orderbook.bids.length} bids, ${orderbook.asks.length} asks`);

          // Получение деталей рынка
          const [tickSize, feeRate, midpoint] = await Promise.all([
            this.polymarketService.getTickSize(tokenId),
            this.polymarketService.getFeeRate(tokenId),
            this.polymarketService.getMidpoint(tokenId)
          ]);

          console.log(`   Размер тика: ${tickSize?.tickSize || 'N/A'}`);
          console.log(`   Комиссия: ${feeRate} bps`);
          console.log(`   Средняя цена: ${midpoint?.price || 'N/A'}`);
        }
      }

      // Получение открытых ордеров
      const openOrders = await this.polymarketService.getOpenOrders({ limit: 5 });
      console.log(`   Открытых ордеров: ${openOrders.length}`);

      // Получение истории сделок
      const trades = await this.polymarketService.getTrades({ limit: 5 });
      console.log(`   Последних сделок: ${trades.length}`);

    } catch (error) {
      console.log('   CLOB API недоступен (это нормально без правильной настройки)');
    }
  }

  /**
   * Демонстрация размещения ордера
   */
  async demonstrateOrderPlacement(): Promise<void> {
    console.log('\n📝 Демонстрация размещения ордера...');

    try {
      // Получаем первый доступный токен
      const marketsResponse = await this.polymarketService.getMarkets();
      if (marketsResponse.results.length === 0) {
        console.log('   Нет доступных рынков для демонстрации');
        return;
      }

      const firstMarket = marketsResponse.results[0];
      const tokenId = firstMarket.tokenIds?.[0] || firstMarket.id;

      const orderParams: CreateOrderParams = {
        tokenID: tokenId,
        price: 0.5,
        size: 1000000, // 1 USDC в base units
        side: 'BUY',
        orderType: 'GTC'
      };

      console.log('   Параметры ордера:', orderParams);

      // Валидация параметров
      this.polymarketService['validateOrderParams'](orderParams);
      console.log('   ✅ Параметры ордера валидны');

      // В реальном приложении здесь будет размещение ордера
      // const order = await this.polymarketService.createOrder(orderParams);
      console.log('   ⚠️  Создание ордера закомментировано для безопасности');

    } catch (error) {
      console.log('   ❌ Ошибка валидации:', error);
    }
  }

  /**
   * Запуск бота
   */
  async run(): Promise<void> {
    try {
      await this.initialize();
      await this.getWalletInfo();
      await this.checkApprovalStatus();
      await this.demonstrateClobOperations();
      await this.demonstrateOrderPlacement();

      console.log('\n🎉 Бот готов к работе!');
      console.log('💡 Используйте методы сервисов для взаимодействия с Polymarket');
      console.log('📚 Запустите примеры: npm run examples');

    } catch (error) {
      console.error('💥 Критическая ошибка:', error);
      process.exit(1);
    }
  }
}

// Запуск бота
async function main(): Promise<void> {
  const bot = new PolymarketBot();
  await bot.run();
}

// Обработка ошибок
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Запуск приложения
if (require.main === module) {
  main().catch((error) => {
    console.error('Ошибка запуска:', error);
    process.exit(1);
  });
}

export { PolymarketBot };