import dotenv from 'dotenv';
import { WalletService } from './services/WalletService';
import { PolymarketService } from './services/PolymarketService';
import { CreateOrderParams } from './types';

// Загружаем переменные окружения
dotenv.config();

/**
 * Примеры использования Polymarket Bot на основе официального CLOB API
 * https://github.com/Polymarket/clob-client
 */
class PolymarketExamples {
  private walletService: WalletService;
  private polymarketService: PolymarketService;

  constructor() {
    this.walletService = new WalletService();
    this.polymarketService = new PolymarketService(this.walletService);
  }

  /**
   * Пример 1: Получение списка активных рынков
   */
  async getActiveMarkets(): Promise<void> {
    console.log('\n📊 Пример 1: Получение активных рынков');

    try {
      const response = await this.polymarketService.getMarkets();

      console.log(`Найдено ${response.results.length} рынков:`);
      response.results.slice(0, 5).forEach((market: any, index: number) => {
        console.log(`${index + 1}. ${market.question}`);
        console.log(`   ID: ${market.id}`);
        console.log(`   Condition ID: ${market.conditionId}`);
        console.log(`   Объем: $${market.volume || 'N/A'}`);
        console.log(`   Ликвидность: $${market.liquidity || 'N/A'}`);
        console.log(`   Активен: ${market.active ? 'Да' : 'Нет'}`);
        console.log('');
      });

      console.log(`Следующий курсор: ${response.next_cursor}`);
    } catch (error) {
      console.error('Ошибка получения рынков:', error);
    }
  }

  /**
   * Пример 2: Получение ордербука для конкретного токена
   */
  async getMarketOrderbook(tokenId: string): Promise<void> {
    console.log('\n📋 Пример 2: Получение ордербука');

    try {
      const orderbook = await this.polymarketService.getOrderBook(tokenId);

      if (orderbook) {
        console.log(`Ордербук для токена ${tokenId}:`);

        console.log('\n🔴 Лучшие предложения на продажу (asks):');
        orderbook.asks.slice(0, 5).forEach((ask: any, index: number) => {
          console.log(`   ${index + 1}. Цена: ${ask.price}, Размер: ${ask.size}`);
        });

        console.log('\n🟢 Лучшие предложения на покупку (bids):');
        orderbook.bids.slice(0, 5).forEach((bid: any, index: number) => {
          console.log(`   ${index + 1}. Цена: ${bid.price}, Размер: ${bid.size}`);
        });
      } else {
        console.log('Ордербук не найден');
      }
    } catch (error) {
      console.error('Ошибка получения ордербука:', error);
    }
  }

  /**
   * Пример 3: Получение информации о рынке
   */
  async getMarketInfo(conditionId: string): Promise<void> {
    console.log('\n📈 Пример 3: Информация о рынке');

    try {
      const market = await this.polymarketService.getMarket(conditionId);

      if (market) {
        console.log(`Рынок: ${market.question}`);
        console.log(`Описание: ${market.description}`);
        console.log(`Дата окончания: ${market.endDate}`);
        console.log(`Исходы: ${market.outcomes?.join(', ')}`);
        console.log(`Активен: ${market.active ? 'Да' : 'Нет'}`);
        console.log(`Закрыт: ${market.closed ? 'Да' : 'Нет'}`);
        console.log(`Архивирован: ${market.archived ? 'Да' : 'Нет'}`);
      } else {
        console.log('Рынок не найден');
      }
    } catch (error) {
      console.error('Ошибка получения информации о рынке:', error);
    }
  }

  /**
   * Пример 4: Получение размера тика и комиссии
   */
  async getMarketDetails(tokenId: string): Promise<void> {
    console.log('\n📏 Пример 4: Детали рынка');

    try {
      const [tickSize, feeRate, midpoint, spread, lastPrice] = await Promise.all([
        this.polymarketService.getTickSize(tokenId),
        this.polymarketService.getFeeRate(tokenId),
        this.polymarketService.getMidpoint(tokenId),
        this.polymarketService.getSpread(tokenId),
        this.polymarketService.getLastTradePrice(tokenId)
      ]);

      console.log(`Токен: ${tokenId}`);
      console.log(`Размер тика: ${tickSize?.tickSize || 'N/A'}`);
      console.log(`Комиссия: ${feeRate} bps`);
      console.log(`Средняя цена: ${midpoint?.price || 'N/A'}`);
      console.log(`Спред: ${spread?.spread || 'N/A'}`);
      console.log(`Последняя цена: ${lastPrice?.price || 'N/A'}`);
    } catch (error) {
      console.error('Ошибка получения деталей рынка:', error);
    }
  }

  /**
   * Пример 5: Получение истории цен
   */
  async getPriceHistory(tokenId: string): Promise<void> {
    console.log('\n📈 Пример 5: История цен');

    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // 24 часа назад

      const priceHistory = await this.polymarketService.getPriceHistory({
        tokenID: tokenId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        interval: '1h'
      });

      console.log(`История цен для токена ${tokenId}:`);
      priceHistory.slice(0, 10).forEach((price: any, index: number) => {
        console.log(`${index + 1}. ${new Date(price.timestamp).toLocaleString()}: $${price.price}`);
      });
    } catch (error) {
      console.error('Ошибка получения истории цен:', error);
    }
  }

  /**
   * Пример 6: Получение баланса и allowance
   */
  async getBalanceInfo(tokenId: string): Promise<void> {
    console.log('\n💰 Пример 6: Баланс и allowance');

    try {
      const [balance, allowance, collateralBalance] = await Promise.all([
        this.polymarketService.getBalanceAndAllowance(tokenId),
        this.polymarketService.getCollateralAllowance(),
        this.polymarketService.getCollateralBalance()
      ]);

      console.log(`Токен: ${tokenId}`);
      console.log(`Баланс токена: ${balance.balance}`);
      console.log(`Allowance токена: ${balance.allowance}`);
      console.log(`Баланс USDC: ${collateralBalance}`);
      console.log(`Allowance USDC: ${allowance}`);
    } catch (error) {
      console.error('Ошибка получения информации о балансе:', error);
    }
  }

  /**
   * Пример 7: Получение открытых ордеров
   */
  async getOpenOrders(): Promise<void> {
    console.log('\n📋 Пример 7: Открытые ордера');

    try {
      const orders = await this.polymarketService.getOpenOrders({ limit: 10 });

      console.log(`Найдено ${orders.length} открытых ордеров:`);

      orders.forEach((order: any, index: number) => {
        console.log(`${index + 1}. Ордер ${order.id}`);
        console.log(`   Токен: ${order.tokenID}`);
        console.log(`   Сторона: ${order.side}`);
        console.log(`   Размер: ${order.size}`);
        console.log(`   Цена: ${order.price}`);
        console.log(`   Статус: ${order.status}`);
        console.log(`   Создан: ${new Date(order.createdAt).toLocaleString()}`);
        console.log('');
      });
    } catch (error) {
      console.error('Ошибка получения открытых ордеров:', error);
    }
  }

  /**
   * Пример 8: Получение истории сделок
   */
  async getTradingHistory(): Promise<void> {
    console.log('\n📊 Пример 8: История сделок');

    try {
      const trades = await this.polymarketService.getTrades({ limit: 10 });

      console.log(`Найдено ${trades.length} последних сделок:`);

      trades.forEach((trade: any, index: number) => {
        console.log(`${index + 1}. Сделка ${trade.id}`);
        console.log(`   Токен: ${trade.tokenID}`);
        console.log(`   Сторона: ${trade.side}`);
        console.log(`   Размер: ${trade.size}`);
        console.log(`   Цена: ${trade.price}`);
        console.log(`   Maker: ${trade.maker}`);
        console.log(`   Taker: ${trade.taker}`);
        console.log(`   Время: ${new Date(trade.timestamp).toLocaleString()}`);
        console.log('');
      });
    } catch (error) {
      console.error('Ошибка получения истории сделок:', error);
    }
  }

  /**
   * Пример 9: Создание ордера (демонстрация)
   */
  async demonstrateOrderCreation(tokenId: string): Promise<void> {
    console.log('\n📝 Пример 9: Создание ордера (демонстрация)');

    try {
      const orderParams: CreateOrderParams = {
        tokenID: tokenId,
        price: 0.5,
        size: 1000000, // 1 USDC в base units
        side: 'BUY',
        orderType: 'GTC'
      };

      console.log('Параметры ордера:', orderParams);

      // Валидация параметров
      this.polymarketService['validateOrderParams'](orderParams);
      console.log('✅ Параметры ордера валидны');

      // В реальном приложении здесь будет создание ордера
      // const order = await this.polymarketService.createOrder(orderParams);
      console.log('⚠️  Создание ордера закомментировано для безопасности');

    } catch (error) {
      console.log('❌ Ошибка валидации:', error);
    }
  }

  /**
   * Запуск всех примеров
   */
  async runAllExamples(): Promise<void> {
    console.log('🚀 Запуск примеров использования Polymarket Bot');
    console.log('Основано на официальном CLOB API: https://github.com/Polymarket/clob-client');

    try {
      // Проверяем подключение
      const isConnected = await this.polymarketService.checkConnection();
      if (!isConnected) {
        console.log('❌ CLOB API недоступен. Проверьте подключение к интернету.');
        return;
      }

      // Получаем время сервера
      await this.polymarketService.getServerTime();

      // Получаем список рынков для примеров
      const marketsResponse = await this.polymarketService.getMarkets();
      if (marketsResponse.results.length === 0) {
        console.log('❌ Нет доступных рынков для примеров');
        return;
      }

      const exampleMarket = marketsResponse.results[0];
      const exampleTokenId = exampleMarket.tokenIds?.[0] || exampleMarket.id;
      const exampleConditionId = exampleMarket.conditionId || exampleMarket.id;

      console.log(`\n📈 Используем рынок для примеров: ${exampleMarket.question}`);

      // Запускаем примеры
      await this.getActiveMarkets();
      await this.getMarketInfo(exampleConditionId);
      await this.getMarketOrderbook(exampleTokenId);
      await this.getMarketDetails(exampleTokenId);
      await this.getPriceHistory(exampleTokenId);
      await this.getBalanceInfo(exampleTokenId);
      await this.getOpenOrders();
      await this.getTradingHistory();
      await this.demonstrateOrderCreation(exampleTokenId);

      console.log('\n✅ Все примеры выполнены успешно!');

    } catch (error) {
      console.error('❌ Ошибка выполнения примеров:', error);
    }
  }
}

// Запуск примеров
async function main(): Promise<void> {
  const examples = new PolymarketExamples();
  await examples.runAllExamples();
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
    console.error('Ошибка запуска примеров:', error);
    process.exit(1);
  });
}

export { PolymarketExamples };