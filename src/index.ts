/**
 * Polymarket Trading Bot
 * Основной файл бота с модульной архитектурой
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient, Side, OrderType, AssetType, TickSize } from "@polymarket/clob-client";
import { getErrorMessage } from "./types/errors";
// Используем OpenOrder из clob-client вместо нашего типа
import { EndgameStrategy, EndgameConfig, DEFAULT_ORDER_SIZE } from "./strategies/EndgameStrategy";
import {
    Market,
    Position,
    OrderSide,
    TradeSignal
} from "./types";

// Загрузка переменных окружения
dotenvConfig({ path: resolve(__dirname, "../.env") });

// Фильтрация логов CLOB Client (убираем шум)
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
    const message = args[0]?.toString() || '';
    // Пропускаем логи от CLOB Client
    if (message.includes('[CLOB Client]')) {
        return;
    }
    originalConsoleError.apply(console, args);
};

// Конфигурация Endgame стратегии с минимальным хеджем
const STRATEGY_CONFIG: EndgameConfig = {
    // Базовые параметры
    spread: 0,
    orderSize: DEFAULT_ORDER_SIZE,  // $10 на сделку
    maxPosition: 10000,
    profitThreshold: 0,
    stopLoss: 0,

    // Endgame параметры
    maxAcceptableLoss: 0.03,   // 3% максимальный убыток (минимальный хедж)
    minProbability: 0.90,      // 90%+ вероятность
    maxProbability: 0.99,      // До 99%
    maxDaysToResolution: 14,   // Макс 2 недели до разрешения
    earlyExitThreshold: 0.99,  // Выходить если достигли 99%

    // Фильтры
    // minVolume удален - volume не возвращается API
    maxMarkets: 5,             // Макс 5 сделок
    excludeNegRisk: true,      // Исключить NegRisk рынки
    minPrice: 0.90,
    maxPrice: 0.99,

    // Фильтр ликвидности
    minLiquidity: 100,         // Минимум $100 ликвидности
};

// Конфигурация бота
const BOT_CONFIG = {
    host: process.env.CLOB_API_URL || "https://clob.polymarket.com",
    chainId: parseInt(process.env.CHAIN_ID || "137"),
    signatureType: parseInt(process.env.SIGNATURE_TYPE || "0"),
    runInterval: 24 * 60 * 60 * 1000,  // Запуск раз в 24 часа
    runOnStartup: true,                 // Запустить сразу при старте
};

class PolymarketBot {
    private client: ClobClient;
    private wallet: ethers.Wallet;
    private strategy: EndgameStrategy;
    private isRunning: boolean = false;
    private positions: Map<string, Position> = new Map();

    constructor(strategy: EndgameStrategy) {
        if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
            throw new Error("Missing PK or FUNDER_ADDRESS in .env");
        }

        this.wallet = new ethers.Wallet(process.env.PK);
        this.client = new ClobClient(BOT_CONFIG.host, BOT_CONFIG.chainId);
        this.strategy = strategy;
    }

    /**
     * Инициализация бота с аутентификацией
     */
    async initialize(): Promise<void> {
        console.log("🤖 Инициализация Polymarket Bot...\n");

        const address = await this.wallet.getAddress();
        console.log(`👤 Адрес: ${address}`);
        console.log(`🎯 Стратегия: ${this.strategy.name}`);
        console.log(`🔗 CLOB API: ${BOT_CONFIG.host}`);
        console.log(`⚙️  Chain ID: ${BOT_CONFIG.chainId}\n`);

        // Создание API ключей
        console.log("🔑 Получение API ключей...");
        const creds = await new ClobClient(
            BOT_CONFIG.host,
            BOT_CONFIG.chainId,
            this.wallet
        ).createOrDeriveApiKey();

        // Инициализация аутентифицированного клиента
        this.client = new ClobClient(
            BOT_CONFIG.host,
            BOT_CONFIG.chainId,
            this.wallet,
            creds,
            BOT_CONFIG.signatureType,
            process.env.FUNDER_ADDRESS
        );

        console.log("✅ Бот инициализирован");

        // Передаем client в стратегию для проверки ликвидности
        this.strategy.setClient(this.client);

        // Проверяем и устанавливаем approve для USDC
        await this.setupUSDCApproval();
    }

    /**
     * Установка unlimited approve для USDC
     */
    async setupUSDCApproval(): Promise<void> {
        try {
            console.log("\n🔓 Проверка USDC allowance...");

            const address = await this.wallet.getAddress();

            // USDC контракты на Polygon
            const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e
            const EXCHANGE_ADDRESS = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"; // Polymarket Exchange

            // Подключаемся к Polygon
            const provider = new ethers.providers.JsonRpcProvider("https://polygon-rpc.com");
            const signer = this.wallet.connect(provider);

            // ERC20 ABI для approve
            const ERC20_ABI = [
                "function allowance(address owner, address spender) view returns (uint256)",
                "function approve(address spender, uint256 amount) returns (bool)",
                "function balanceOf(address owner) view returns (uint256)",
                "function decimals() view returns (uint8)"
            ];

            const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

            // Проверяем текущий allowance
            const currentAllowance = await usdcContract.allowance(address, EXCHANGE_ADDRESS);
            const balance = await usdcContract.balanceOf(address);
            const decimals = await usdcContract.decimals();

            const allowanceFormatted = parseFloat(ethers.utils.formatUnits(currentAllowance, decimals));
            const balanceFormatted = parseFloat(ethers.utils.formatUnits(balance, decimals));

            console.log(`   Баланс: $${balanceFormatted.toFixed(2)}`);
            console.log(`   Текущий allowance: $${allowanceFormatted.toFixed(2)}`);

            // Если allowance достаточно большой (> $1000), не делаем approve
            if (allowanceFormatted > 1000) {
                console.log(`   ✅ Allowance достаточный, approve не требуется\n`);
                return;
            }

            console.log(`   ⚠️  Требуется approve для USDC`);
            console.log(`   📝 Отправка approve транзакции...`);
            console.log(`   ⏳ Ожидай подтверждения в блокчейне (30-60 сек)...`);

            // Делаем unlimited approve (максимальное значение uint256)
            const maxApproval = ethers.constants.MaxUint256;
            const tx = await usdcContract.approve(EXCHANGE_ADDRESS, maxApproval);

            console.log(`   📤 Tx Hash: ${tx.hash}`);
            console.log(`   ⏳ Ожидание подтверждения...`);

            await tx.wait();

            console.log(`   ✅ USDC approved! Теперь можно размещать ордера\n`);
            console.log(`   🔗 https://polygonscan.com/tx/${tx.hash}\n`);

        } catch (error: unknown) {
            console.log(`   ⚠️  Ошибка при approve: ${getErrorMessage(error)}`);
            console.log(`   Попробуй вручную сделать сделку на polymarket.com\n`);
        }
    }

    /**
     * Получение активных рынков через стратегию
     */
    async getActiveMarkets(): Promise<Market[]> {
        const response = await this.client.getSamplingMarkets();
        const markets = response.data || [];

        // Используем async фильтр стратегии с проверкой ликвидности
        return this.strategy.asyncFilterMarkets(markets);
    }

    /**
     * Получение текущей цены (вероятности) для токена
     */
    async getTokenPrice(tokenId: string): Promise<number | null> {
        try {
            const midpoint = await this.client.getMidpoint(tokenId);
            return parseFloat(midpoint);
        } catch (error) {
            console.error(`Ошибка получения цены для ${tokenId}:`, error);
            return null;
        }
    }

    /**
     * Обработка торговых сигналов для Endgame стратегии
     */
    async processSignals(market: Market): Promise<void> {
        if (!market.tokens || market.tokens.length === 0) return;

        const yesToken = market.tokens.find(t => t.outcome === "Yes");
        const noToken = market.tokens.find(t => t.outcome === "No");

        if (!yesToken || !noToken) return;

        // Используем цену из объекта рынка (getMidpoint может не работать для неактивных рынков)
        const currentPrice = yesToken.price;
        const position = this.positions.get(yesToken.token_id);

        // Генерируем сигналы через стратегию
        const signals = this.strategy.generateSignals(market, currentPrice, position);

        if (signals.length === 0) return;

        console.log(`\n${"─".repeat(70)}`);
        console.log(`📊 ${market.question}`);
        console.log(`${"─".repeat(70)}`);
        console.log(`   YES: ${(currentPrice * 100).toFixed(2)}%`);
        console.log(`   NO:  ${((1 - currentPrice) * 100).toFixed(2)}%`);

        // Показываем анализ сделки
        const analysis = this.strategy.analyzeTradeSetup(market, currentPrice);
        if (analysis.valid) {
            console.log(`\n${analysis.analysis}`);
        }

        if (position) {
            const pnl = this.strategy.calculatePnL(position, currentPrice);
            console.log(`\n   📍 Текущая позиция: ${position.size} @ ${(position.averagePrice * 100).toFixed(2)}%`);
            console.log(`   P&L: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)} USDC`);
        }

        // Обрабатываем каждый сигнал (YES + NO хедж)
        for (const signal of signals) {
            if (!this.strategy.validateSignal(signal)) {
                console.log(`\n   ⚠️  Невалидный сигнал: ${signal.reason}`);
                continue;
            }

            console.log(`\n   🎯 ${signal.side}: ${signal.size} токенов`);
            console.log(`      ${signal.reason}`);

            await this.executeSignal(signal);
        }
    }

    /**
     * Исполнение торгового сигнала
     */
    async executeSignal(signal: TradeSignal): Promise<void> {
        try {
            const order = await this.client.createAndPostOrder(
                {
                    tokenID: signal.tokenId,
                    price: signal.price,
                    side: signal.side === OrderSide.BUY ? Side.BUY : Side.SELL,
                    size: signal.size,
                },
                {
                    tickSize: signal.market.minimum_tick_size.toString() as TickSize,
                    negRisk: signal.market.neg_risk
                },
                OrderType.GTC
            );

            if (order.success) {
                console.log(`   ✅ Ордер размещен: ${order.orderID}`);

                // Обновляем позицию
                if (signal.side === OrderSide.BUY) {
                    this.updatePosition(signal.tokenId, signal.market.question, signal.size, signal.price);
                }
            } else {
                const errorMsg = order.errorMsg || JSON.stringify(order);
                console.log(`   ❌ Ошибка размещения: ${errorMsg}`);
            }

        } catch (error: unknown) {
            // Обрабатываем специфичные ошибки
            let errorMsg = getErrorMessage(error);
            const axiosError = error as { response?: { status?: number; data?: { error?: string } } };

            if (axiosError.response?.status === 403) {
                errorMsg = 'Cloudflare блокирует запросы. Включи VPN и попробуй позже';
            } else if (axiosError.response?.data?.error) {
                errorMsg = axiosError.response.data.error;
            }

            console.log(`   ❌ Ошибка: ${errorMsg}`);
        }
    }

    /**
     * Закрытие позиции
     */
    async closePosition(market: Market, position: Position, currentPrice: number): Promise<void> {
        const pnl = this.strategy.calculatePnL(position, currentPrice);
        const reason = currentPrice >= this.strategy.config.profitThreshold
            ? `Профит: ${(currentPrice * 100).toFixed(2)}%`
            : currentPrice <= (this.strategy.config.stopLoss || 0)
                ? `Stop Loss: ${(currentPrice * 100).toFixed(2)}%`
                : 'Рынок закрывается';

        console.log(`\n💰 ЗАКРЫТИЕ ПОЗИЦИИ: ${market.question}`);
        console.log(`   Причина: ${reason}`);
        console.log(`   Позиция: ${position.size} @ ${(position.averagePrice * 100).toFixed(2)}%`);
        console.log(`   Текущая цена: ${(currentPrice * 100).toFixed(2)}%`);
        console.log(`   P&L: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)} USDC`);

        try {
            const order = await this.client.createMarketOrder({
                tokenID: position.tokenId,
                amount: position.size,
                side: Side.SELL,
            });
            await this.client.postOrder(order, OrderType.FOK);

            console.log(`   ✅ Позиция закрыта`);
            this.positions.delete(position.tokenId);

        } catch (error: unknown) {
            console.error(`   ❌ Ошибка закрытия:`, getErrorMessage(error));
        }
    }

    /**
     * Обновление позиции
     */
    private updatePosition(tokenId: string, market: string, size: number, price: number): void {
        const existing = this.positions.get(tokenId);

        if (existing) {
            // Обновляем среднюю цену
            const totalSize = existing.size + size;
            const totalCost = (existing.size * existing.averagePrice) + (size * price);
            existing.size = totalSize;
            existing.averagePrice = totalCost / totalSize;
        } else {
            // Создаем новую позицию
            this.positions.set(tokenId, {
                tokenId,
                market,
                size,
                averagePrice: price,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Получение баланса USDC (allowance)
     */
    async getBalance(): Promise<number> {
        try {
            // Используем метод для получения allowance (доступного баланса)
            const address = await this.wallet.getAddress();
            const params = {
                address: address,
                tokenID: "USDC",
                    asset_type: AssetType.COLLATERAL
            };
            const response = await this.client.getBalanceAllowance(params);
            return parseFloat(response.balance || "0");
        } catch (error: unknown) {
            console.log(`⚠️  Не удалось получить баланс: ${getErrorMessage(error)}`);
            return 0;
        }
    }

    /**
     * Получение открытых ордеров
     */
    async getOpenOrders(): Promise<Array<import('@polymarket/clob-client').OpenOrder>> {
        try {
            // Получаем открытые ордера (live orders)
            const orders = await this.client.getOpenOrders();
            return orders || [];
        } catch (error: unknown) {
            console.log(`⚠️  Не удалось получить ордера: ${getErrorMessage(error)}`);
            return [];
        }
    }

    /**
     * Ежедневный поиск и вход в Endgame сделки
     */
    async runDailyEndgame(): Promise<void> {
        try {
            console.log(`\n${"=".repeat(70)}`);
            console.log(`🔍 ПОИСК ENDGAME ВОЗМОЖНОСТЕЙ`);
            console.log(`⏰ ${new Date().toLocaleString()}`);
            console.log("=".repeat(70));

            // Проверяем баланс и позиции
            console.log(`\n💰 Проверка баланса и позиций...`);
            const balance = await this.getBalance();
            const openOrders = await this.getOpenOrders();

            console.log(`   Баланс USDC (API): $${balance.toFixed(2)}`);
            console.log(`   Открытых ордеров (API): ${openOrders.length}`);
            console.log(`   Открытых позиций (локально): ${this.positions.size}`);
            console.log(`   Требуется для сделки: $${this.strategy.config.orderSize}`);

            // Показываем детали ордеров если есть
            if (openOrders.length > 0) {
                console.log(`\n📋 Активные ордера:`);
                openOrders.slice(0, 10).forEach((order, i: number) => {
                    const side = order.side || 'N/A';
                    const size = order.size_matched || order.original_size || 'N/A';
                    const price = order.price ? `${(parseFloat(order.price) * 100).toFixed(2)}%` : 'N/A';
                    // status не существует в типе OpenOrder из clob-client
                    const status = 'open'; // Всегда 'open' для открытых ордеров
                    console.log(`   ${i + 1}. [${status}] ${side} ${size} токенов @ ${price}`);
                });
                if (openOrders.length > 10) {
                    console.log(`   ... и ещё ${openOrders.length - 10} ордеров`);
                }
            }

            // Показываем детали позиций
            if (this.positions.size > 0) {
                console.log(`\n📍 Открытые позиции:`);
                let posIndex = 1;
                this.positions.forEach((position, _tokenId) => {
                    const marketShort = position.market.length > 60
                        ? `${position.market.substring(0, 60)}...`
                        : position.market;
                    const avgPrice = (position.averagePrice * 100).toFixed(2);
                    const cost = (position.size * position.averagePrice).toFixed(2);
                    console.log(`   ${posIndex}. ${marketShort}`);
                    console.log(`      ${position.size} токенов @ ${avgPrice}% = $${cost}`);
                    posIndex++;
                });
            }

            if (balance < this.strategy.config.orderSize) {
                console.log(`\n⚠️  НЕДОСТАТОЧНО БАЛАНСА!`);
                console.log(`   Требуется: $${this.strategy.config.orderSize}`);
                console.log(`   Доступно: $${balance.toFixed(2)}`);
                console.log(`   Пополни кошелек USDC.e на Polygon`);
                console.log(`   Адрес: ${await this.wallet.getAddress()}`);
                return;
            }

            // Получаем отфильтрованные рынки
            const markets = await this.getActiveMarkets();
            console.log(`\n📊 Найдено подходящих рынков: ${markets.length}`);

            if (markets.length === 0) {
                console.log(`\n   💤 Нет подходящих возможностей`);
                console.log(`   Параметры: 90-99% вероятность, < 14 дней до разрешения`);
                return;
            }

            // Обрабатываем каждый рынок
            let entriesCount = 0;
            for (const market of markets) {
                await this.processSignals(market);
                entriesCount++;
            }

            console.log(`\n${"=".repeat(70)}`);
            console.log(`✅ ОБРАБОТАНО РЫНКОВ: ${entriesCount}`);
            console.log(`📈 Открытых позиций: ${this.positions.size}`);
            console.log("=".repeat(70));

        } catch (error: unknown) {
            console.error("\n❌ Ошибка при поиске:", getErrorMessage(error));
            throw error;
        }
    }

    /**
     * Основной цикл бота - ежедневные запуски
     */
    async run(): Promise<void> {
        this.isRunning = true;
        console.log("🚀 Запуск Endgame бота...\n");
        console.log("⚠️  РЕАЛЬНАЯ ТОРГОВЛЯ: Ордера будут размещаться!");
        console.log(`📅 Расписание: раз в ${BOT_CONFIG.runInterval / (1000 * 60 * 60)} часов`);
        console.log(`🎯 Стратегия: ${this.strategy.name}`);
        console.log(`💰 Размер сделки: $${this.strategy.config.orderSize}`);
        console.log(`🛡️  Хедж: ${(this.strategy.config.maxAcceptableLoss * 100).toFixed(1)}% максимальный убыток\n`);

        // Первый запуск сразу если включено
        if (BOT_CONFIG.runOnStartup) {
            await this.runDailyEndgame();
        }

        // Цикл ежедневных запусков
        while (this.isRunning) {
            try {
                const nextRun = new Date(Date.now() + BOT_CONFIG.runInterval);
                console.log(`\n⏳ Следующий запуск: ${nextRun.toLocaleString()}`);
                console.log(`   (через ${BOT_CONFIG.runInterval / (1000 * 60 * 60)} часов)`);

                await this.sleep(BOT_CONFIG.runInterval);

                if (this.isRunning) {
                    await this.runDailyEndgame();
                }

            } catch (error: unknown) {
                console.error("\n❌ Ошибка в цикле:", getErrorMessage(error));
                console.log("⏳ Повтор через 1 час...");
                await this.sleep(60 * 60 * 1000);
            }
        }
    }

    /**
     * Остановка бота
     */
    stop(): void {
        console.log("\n🛑 Остановка бота...");
        this.isRunning = false;
    }

    /**
     * Утилита для задержки
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Точка входа
async function main() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                  POLYMARKET ENDGAME BOT                        ║
║       Автоматический поиск и вход в эндгейм сделки             ║
║              (90-99% вероятность + минимальный хедж)           ║
╚════════════════════════════════════════════════════════════════╝
`);

    // Создаем Endgame стратегию
    const strategy = new EndgameStrategy(STRATEGY_CONFIG);

    // Создаем бота с этой стратегией
    const bot = new PolymarketBot(strategy);

    try {
        await bot.initialize();

        // Обработка graceful shutdown
        const { setupGracefulShutdown } = await import('./utils/graceful-shutdown');
        setupGracefulShutdown(bot);

        await bot.run();

    } catch (error: unknown) {
        console.error("\n💥 Критическая ошибка:", getErrorMessage(error));
        if (error instanceof Error && error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Запуск
if (require.main === module) {
    main();
}

export { PolymarketBot, STRATEGY_CONFIG, BOT_CONFIG };
