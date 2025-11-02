import dotenv from 'dotenv';
import { WalletService } from './services/WalletService';
import { PolymarketService } from './services/PolymarketService';

// Загружаем переменные окружения
dotenv.config();

/**
 * Тест с реальным кошельком и созданием ордера в реальном пуле Polymarket
 * ВНИМАНИЕ: Этот тест использует реальные средства!
 */
class RealPolymarketTest {
    private walletService: WalletService;
    private polymarketService: PolymarketService;

    constructor() {
        this.walletService = new WalletService();
        this.polymarketService = new PolymarketService(this.walletService);
    }

    /**
     * Проверка подключения и базовой информации
     */
    async checkConnection(): Promise<void> {
        console.log('🔍 Проверка подключения...');

        try {
            // Проверяем подключение к сети
            const networkConnected = await this.walletService.checkConnection();
            console.log(`📡 Сеть: ${networkConnected ? '✅ Подключена' : '❌ Недоступна'}`);

            // Проверяем подключение к CLOB API
            const clobConnected = await this.polymarketService.checkConnection();
            console.log(`🔗 CLOB API: ${clobConnected ? '✅ Подключен' : '❌ Недоступен'}`);

            // Получаем время сервера
            const serverTime = await this.polymarketService.getServerTime();
            console.log(`🕐 Время сервера: ${new Date(serverTime).toLocaleString()}`);

            // Информация о кошельке
            const address = this.walletService.getAddress();
            const ethBalance = await this.walletService.getBalance();
            const usdcBalance = await this.polymarketService.getCollateralBalance();

            console.log(`💰 Кошелек: ${address}`);
            console.log(`💎 ETH: ${ethBalance}`);
            console.log(`💵 USDC: ${usdcBalance}`);

        } catch (error) {
            console.error('❌ Ошибка проверки подключения:', error);
            throw error;
        }
    }

    /**
     * Получение активных рынков
     */
    async getActiveMarkets(): Promise<any[]> {
        console.log('\n📊 Получение активных рынков...');

        try {
            const response = await this.polymarketService.getMarkets();
            const markets = (response as any).results || [];

            console.log(`✅ Найдено ${markets.length} рынков`);

            // Показываем первые 5 рынков
            markets.slice(0, 5).forEach((market: any, index: number) => {
                console.log(`${index + 1}. ${market.question}`);
                console.log(`   ID: ${market.id}`);
                console.log(`   Condition ID: ${market.conditionId}`);
                console.log(`   Активен: ${market.active ? 'Да' : 'Нет'}`);
                console.log(`   Токены: ${market.tokenIds?.join(', ') || 'N/A'}`);
                console.log('');
            });

            return markets;
        } catch (error) {
            console.error('❌ Ошибка получения рынков:', error);
            throw error;
        }
    }

    /**
     * Анализ конкретного рынка
     */
    async analyzeMarket(tokenId: string): Promise<void> {
        console.log(`\n📈 Анализ рынка: ${tokenId}`);

        try {
            // Получаем ордербук
            const orderbook = await this.polymarketService.getOrderBook(tokenId);

            if (orderbook) {
                console.log('📋 Ордербук:');
                console.log(`   Bids: ${orderbook.bids?.length || 0}`);
                console.log(`   Asks: ${orderbook.asks?.length || 0}`);

                if (orderbook.bids && orderbook.bids.length > 0) {
                    console.log(`   Лучший bid: ${orderbook.bids[0].price} (${orderbook.bids[0].size})`);
                }
                if (orderbook.asks && orderbook.asks.length > 0) {
                    console.log(`   Лучший ask: ${orderbook.asks[0].price} (${orderbook.asks[0].size})`);
                }
            }

            // Получаем детали рынка
            const [tickSize, feeRate, midpoint, spread, lastPrice] = await Promise.all([
                this.polymarketService.getTickSize(tokenId),
                this.polymarketService.getFeeRate(tokenId),
                this.polymarketService.getMidpoint(tokenId),
                this.polymarketService.getSpread(tokenId),
                this.polymarketService.getLastTradePrice(tokenId)
            ]);

            console.log('📊 Детали рынка:');
            console.log(`   Размер тика: ${tickSize || 'N/A'}`);
            console.log(`   Комиссия: ${feeRate} bps`);
            console.log(`   Средняя цена: ${midpoint?.price || 'N/A'}`);
            console.log(`   Спред: ${spread?.spread || 'N/A'}`);
            console.log(`   Последняя цена: ${lastPrice?.price || 'N/A'}`);

        } catch (error) {
            console.error('❌ Ошибка анализа рынка:', error);
            throw error;
        }
    }

    /**
     * Проверка баланса и allowance
     */
    async checkBalanceAndAllowance(tokenId: string): Promise<void> {
        console.log(`\n💰 Проверка баланса для токена: ${tokenId}`);

        try {
            const [balance, collateralBalance, collateralAllowance] = await Promise.all([
                this.polymarketService.getBalanceAndAllowance(tokenId),
                this.polymarketService.getCollateralBalance(),
                this.polymarketService.getCollateralAllowance()
            ]);

            console.log('💼 Балансы:');
            console.log(`   Токен ${tokenId}: ${balance.balance}`);
            console.log(`   Allowance токена: ${balance.allowance}`);
            console.log(`   USDC баланс: ${collateralBalance}`);
            console.log(`   USDC allowance: ${collateralAllowance}`);

        } catch (error) {
            console.error('❌ Ошибка проверки баланса:', error);
            throw error;
        }
    }

    /**
     * Создание тестового ордера (ВНИМАНИЕ: использует реальные средства!)
     */
    async createTestOrder(tokenId: string): Promise<void> {
        console.log(`\n📝 Создание тестового ордера для токена: ${tokenId}`);

        try {
            // Получаем текущий ордербук для определения разумной цены
            const orderbook = await this.polymarketService.getOrderBook(tokenId);

            if (!orderbook || !orderbook.bids || orderbook.bids.length === 0) {
                console.log('❌ Нет доступных цен для создания ордера');
                return;
            }

            // Используем цену немного ниже лучшего bid для покупки
            const bestBidPrice = parseFloat(orderbook.bids[0].price);
            const testPrice = Math.max(0.01, bestBidPrice - 0.01); // Минимум 1 цент

            const orderParams = {
                tokenID: tokenId,
                price: testPrice,
                size: 1000000, // 1 USDC в base units
                side: 'BUY',
                orderType: 'GTC'
            };

            console.log('📋 Параметры ордера:', orderParams);
            console.log('⚠️  ВНИМАНИЕ: Это создаст реальный ордер с реальными средствами!');

            // Валидация параметров
            this.polymarketService.validateOrderParams(orderParams);
            console.log('✅ Параметры ордера валидны');

            // Создание ордера (закомментировано для безопасности)
            // const order = await this.polymarketService.createOrder(orderParams);
            // console.log('✅ Ордер создан:', order);

            console.log('🔒 Создание ордера закомментировано для безопасности');
            console.log('💡 Раскомментируйте строки выше для реального создания ордера');

        } catch (error) {
            console.error('❌ Ошибка создания ордера:', error);
            throw error;
        }
    }

    /**
     * Получение истории ордеров и сделок
     */
    async getTradingHistory(): Promise<void> {
        console.log('\n📊 Получение истории торговли...');

        try {
            const [openOrders, trades] = await Promise.all([
                this.polymarketService.getOpenOrders({ limit: 10 }),
                this.polymarketService.getTrades({ limit: 10 })
            ]);

            console.log(`📋 Открытых ордеров: ${openOrders.length}`);
            openOrders.forEach((order: any, index: number) => {
                console.log(`${index + 1}. ${order.id} - ${order.side} ${order.size} @ ${order.price}`);
            });

            console.log(`\n📈 Последних сделок: ${trades.length}`);
            trades.forEach((trade: any, index: number) => {
                console.log(`${index + 1}. ${trade.id} - ${trade.side} ${trade.size} @ ${trade.price}`);
                console.log(`   Время: ${new Date(trade.timestamp).toLocaleString()}`);
            });

        } catch (error) {
            console.error('❌ Ошибка получения истории:', error);
            throw error;
        }
    }

    /**
     * Запуск полного теста
     */
    async runFullTest(): Promise<void> {
        console.log('🚀 Запуск полного теста с реальным кошельком');
        console.log('⚠️  ВНИМАНИЕ: Этот тест использует реальные средства!');

        try {
            // Проверка подключения
            await this.checkConnection();

            // Получение рынков
            const markets = await this.getActiveMarkets();

            if (markets.length === 0) {
                console.log('❌ Нет доступных рынков для тестирования');
                return;
            }

            // Выбираем первый рынок с токенами
            const testMarket = markets.find((market: any) => market.tokenIds && market.tokenIds.length > 0);

            if (!testMarket) {
                console.log('❌ Нет рынков с токенами для тестирования');
                return;
            }

            const testTokenId = testMarket.tokenIds[0];
            console.log(`\n🎯 Выбран рынок для тестирования: ${testMarket.question}`);
            console.log(`🔑 Токен ID: ${testTokenId}`);

            // Анализ рынка
            await this.analyzeMarket(testTokenId);

            // Проверка баланса
            await this.checkBalanceAndAllowance(testTokenId);

            // Создание тестового ордера
            await this.createTestOrder(testTokenId);

            // История торговли
            await this.getTradingHistory();

            console.log('\n✅ Полный тест завершен успешно!');

        } catch (error) {
            console.error('❌ Ошибка выполнения теста:', error);
            throw error;
        }
    }
}

// Запуск теста
async function main(): Promise<void> {
    const test = new RealPolymarketTest();
    await test.runFullTest();
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
        console.error('Ошибка запуска теста:', error);
        process.exit(1);
    });
}

export { RealPolymarketTest };
