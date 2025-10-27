import dotenv from 'dotenv';
import { WalletService } from './services/WalletService';
import { PolymarketService } from './services/PolymarketService';
import { POLYMARKET_CONSTANTS } from './utils/constants';

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
   * Демонстрация работы с позициями
   */
  async demonstratePositionOperations(): Promise<void> {
    console.log('\n🎯 Демонстрация операций с позициями...');
    
    // Пример condition ID (в реальном приложении это будет получено из API Polymarket)
    const exampleConditionId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const outcomeIndex = 0;
    
    try {
      const positionBalance = await this.polymarketService.getPositionBalance(
        exampleConditionId,
        outcomeIndex
      );
      
      console.log(`   Баланс позиции: ${positionBalance}`);
      
    } catch (error) {
      console.log('   Позиция не найдена (это нормально для примера)');
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
      await this.demonstratePositionOperations();
      
      console.log('\n🎉 Бот готов к работе!');
      console.log('💡 Используйте методы сервисов для взаимодействия с Polymarket');
      
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
