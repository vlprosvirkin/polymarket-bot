/**
 * AI-Powered Bot
 * Использует AIStrategy для выбора рынков с помощью искусственного интеллекта
 * Вдохновлен подходом Poly-Trader
 * 
 * Для запуска: ts-node src/bot-ai.ts
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient, Side, OrderType, TickSize } from "@polymarket/clob-client";
import { getErrorMessage } from "./types/errors";
import { AIStrategy, AIStrategyConfig } from "./strategies/AIStrategy";
import {
    Market,
    Position,
    OrderSide,
    TradeSignal
} from "./types";
import { TelegramAdapter } from "./adapters/telegram.adapter";
import { TelegramBot } from "./services/TelegramBot";
import { initDatabase, PostgresAdapter } from "./database";

dotenvConfig({ path: resolve(__dirname, "../.env") });

import { AI_STRATEGY_CONFIG as AI_CONFIG } from './core/config';

// Типизация для ответа getMidpoint от CLOB API
interface MidpointResponse {
    mid?: string;
    price?: string;
    midpoint?: string;
}

// Типизация для ответа getSamplingMarkets от CLOB API
interface SamplingMarketsResponse {
    data: Market[];
    next_cursor?: string;
}

// Типизация для ответа createAndPostOrder от CLOB API
interface OrderResponse {
    success: boolean;
    orderID?: string;
    errorMsg?: string;
}

const STRATEGY_CONFIG: AIStrategyConfig = {
    spread: 0,
    orderSize: 1,        // БЕЗОПАСНО: $1 за ордер (баланс $2.99)
    maxPosition: 2,      // БЕЗОПАСНО: максимум $2 на рынок
    profitThreshold: 0.95,
    stopLoss: 0.75,
    // minVolume удален - volume не возвращается API. Для проверки ликвидности используйте PolymarketDataService + MarketFilter.filterEnrichedForTrading
    // minLiquidity: минимальная общая ликвидность рынка в USDC
    // Ликвидность = сумма всех ордеров (YES + NO токены)
    // Учитываются оба токена, так как стратегии могут торговать и YES и NO
    minLiquidity: 1000,  // Минимум $1000 общей ликвидности (YES + NO)
    maxMarkets: 2,       // БЕЗОПАСНО: максимум 2 рынка одновременно
    excludeNegRisk: true,
    minPrice: 0.10,      // Расширен диапазон для большего выбора
    maxPrice: 0.99,

    // AI настройки
    useAI: true,
    useNews: !!process.env.SERP_API_KEY,
    minAIAttractiveness: AI_CONFIG.DEFAULT_MIN_ATTRACTIVENESS,  // 50%
    maxAIRisk: AI_CONFIG.DEFAULT_MAX_RISK,                      // MEDIUM
    useAIForSignals: true,
    maxMarketsForAI: 20,  // Уменьшен для экономии бюджета

    // Контроль бюджета AI
    maxAIBudgetPerCycle: 0.20,   // $0.20 макс за цикл (экономия)
    maxAIBudgetPerDay: 2.0,      // $2.00 макс за день (экономия)

    // Кэширование (5 минут)
    aiCacheTTL: 5 * 60 * 1000,

    // Фильтр по edge (разница между AI оценкой и рыночной ценой)
    minEdgePercentagePoints: 0.10  // 10 п.п. для большего количества сигналов
};

const BOT_CONFIG = {
    host: process.env.CLOB_API_URL || "https://clob.polymarket.com",
    chainId: parseInt(process.env.CHAIN_ID || "137"),
    signatureType: parseInt(process.env.SIGNATURE_TYPE || "0"),
    updateInterval: 60000
};

class PolymarketAIBot {
    private client: ClobClient;
    private wallet: ethers.Wallet;
    private strategy: AIStrategy;
    private isRunning: boolean = false;
    private positions: Map<string, Position> = new Map();
    private telegramBot?: TelegramBot;
    private db?: PostgresAdapter;

    constructor(strategy: AIStrategy) {
        if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
            throw new Error("Missing PK or FUNDER_ADDRESS in .env");
        }

        this.wallet = new ethers.Wallet(process.env.PK);
        this.client = new ClobClient(BOT_CONFIG.host, BOT_CONFIG.chainId);
        this.strategy = strategy;
    }

    async initialize(): Promise<void> {
        console.log("🤖 AI-Powered Polymarket Bot\n");

        // Инициализация базы данных (опционально)
        if (process.env.DATABASE_URL) {
            try {
                console.log("🗄️  Подключение к базе данных...");
                this.db = await initDatabase();
                console.log("✅ База данных подключена\n");
            } catch (error) {
                console.warn("⚠️  База данных недоступна, продолжаем без неё:", getErrorMessage(error));
            }
        }

        const address = await this.wallet.getAddress();
        console.log(`👤 Адрес: ${address}`);
        console.log(`🎯 Стратегия: ${this.strategy.name}`);
        console.log(`🔗 CLOB API: ${BOT_CONFIG.host}\n`);

        console.log(this.strategy.getDescription());
        console.log();

        console.log("🔑 Получение API ключей...");
        const creds = await new ClobClient(
            BOT_CONFIG.host,
            BOT_CONFIG.chainId,
            this.wallet
        ).createOrDeriveApiKey();

        this.client = new ClobClient(
            BOT_CONFIG.host,
            BOT_CONFIG.chainId,
            this.wallet,
            creds,
            BOT_CONFIG.signatureType,
            process.env.FUNDER_ADDRESS
        );

        // Передаем client в стратегию для работы с обогащенными данными
        this.strategy.setClient(this.client);

        // Инициализация Telegram (опционально)
        if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
            try {
                console.log("📱 Инициализация Telegram...");
                const telegramAdapter = new TelegramAdapter();
                await telegramAdapter.connect();
                this.telegramBot = new TelegramBot(telegramAdapter, this.client);
                console.log("✅ Telegram Bot подключен\n");
            } catch (error) {
                console.warn("⚠️  Telegram не настроен или ошибка подключения:", getErrorMessage(error));
            }
        }

        console.log("✅ Инициализирован\n");
    }

    /**
     * Получение активных рынков через AI фильтрацию
     */
    async getActiveMarkets(): Promise<Market[]> {
        console.log("📡 Получение рынков из API...");
        const response = await this.client.getSamplingMarkets() as SamplingMarketsResponse;
        const markets: Market[] = response.data || [];
        console.log(`✅ Получено ${markets.length} рынков из API`);

        // Используем AI фильтрацию (async метод)
        if (this.strategy.config.useAI) {
            console.log("🤖 Запуск AI фильтрации...");
            const filtered = await this.strategy.asyncFilterMarkets(markets);
            console.log(`✅ AI фильтрация завершена: ${filtered.length} рынков`);
            return filtered;
        }

        // Fallback на синхронную фильтрацию если AI выключен
        console.log("🔍 Использование базовой фильтрации (AI отключен)...");
        const filtered = this.strategy.filterMarkets(markets);
        console.log(`✅ Базовая фильтрация: ${filtered.length} рынков`);
        return filtered;
    }

    async getTokenPrice(tokenId: string): Promise<number | null> {
        try {
            const midpoint: unknown = await this.client.getMidpoint(tokenId);

            // Определяем тип возвращаемого значения
            let priceStr: string;
            if (typeof midpoint === 'string') {
                // Если вернулась строка напрямую
                priceStr = midpoint;
            } else if (typeof midpoint === 'object' && midpoint !== null) {
                // Если вернулся объект, извлекаем из известных полей
                const response = midpoint as MidpointResponse;
                priceStr = response.mid || response.price || response.midpoint || '';

                if (!priceStr) {
                    console.warn(`   ⚠️  Неизвестная структура midpoint: ${JSON.stringify(midpoint)}`);
                    return null;
                }
            } else {
                priceStr = String(midpoint);
            }

            const price = parseFloat(priceStr);

            if (isNaN(price)) {
                console.warn(`   ⚠️  Не удалось распарсить цену из: ${priceStr}`);
                return null;
            }

            return price;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`   ⚠️  Ошибка получения цены для токена ${tokenId.substring(0, 20)}...`);
            console.warn(`   📋 Error: ${errorMessage}`);
            return null;
        }
    }

    /**
     * Обработка торговых сигналов с AI анализом
     */
    async processSignals(market: Market): Promise<void> {
        if (!market.tokens || market.tokens.length === 0) {
            console.log(`   ⚠️  Рынок без токенов, пропуск`);
            return;
        }

        const yesToken = market.tokens.find(t => t.outcome === "Yes");
        if (!yesToken) {
            console.log(`   ⚠️  Не найден YES токен, пропуск`);
            return;
        }
        const currentPrice = await this.getTokenPrice(yesToken.token_id);
        if (!currentPrice) {
            console.log(`   ⚠️  Не удалось получить цену, пропуск`);
            return;
        }

        const position = this.positions.get(yesToken.token_id);

        console.log(`\n${"─".repeat(70)}`);
        console.log(`📊 ${market.question}`);
        console.log(`${"─".repeat(70)}`);
        console.log(`   YES: ${(currentPrice * 100).toFixed(2)}%`);

        if (position) {
            const pnl = (currentPrice - position.averagePrice) * position.size;
            console.log(`   📍 Позиция: ${position.size} @ ${(position.averagePrice * 100).toFixed(2)}%`);
            console.log(`   P&L: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)} USDC`);
        }

        // Генерация сигналов (используем async метод если AI включен)
        console.log(`   🤖 Генерация торговых сигналов...`);
        let signals: TradeSignal[];
        if (this.strategy.config.useAIForSignals) {
            console.log(`   🔄 Использование AI для генерации сигналов...`);
            signals = await this.strategy.asyncGenerateSignals(market, currentPrice, position);
            console.log(`   ✅ AI анализ завершен`);
        } else {
            console.log(`   🔄 Использование базовой генерации сигналов...`);
            signals = this.strategy.generateSignals(market, currentPrice, position);
        }

        if (signals.length === 0) {
            console.log(`   ℹ️  Нет сигналов для этого рынка`);
            return;
        }
        
        console.log(`   📊 Сгенерировано ${signals.length} сигнал(ов)`);

        for (const signal of signals) {
            const tokenOutcome = market.tokens.find(t => t.token_id === signal.tokenId)?.outcome;
            console.log(`\n   📈 ${signal.side} ${tokenOutcome}: ${signal.size} @ ${(signal.price * 100).toFixed(2)}%`);
            console.log(`      ${signal.reason}`);

            await this.executeSignal(signal);
        }
    }

    /**
     * Исполнение торгового сигнала
     */
    async executeSignal(signal: TradeSignal): Promise<void> {
        const tokenOutcome = signal.market.tokens.find(t => t.token_id === signal.tokenId)?.outcome || 'Unknown';

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
            ) as OrderResponse;

            if (order.success && order.orderID) {
                console.log(`      ✅ Ордер размещен: ${order.orderID}`);

                // Сохраняем ордер в базу данных
                if (this.db) {
                    try {
                        await this.db.saveOrder({
                            order_id: order.orderID,
                            token_id: signal.tokenId,
                            condition_id: signal.market.condition_id,
                            market_slug: signal.market.market_slug,
                            side: signal.side,
                            price: signal.price,
                            size: signal.size,
                            order_type: 'GTC',
                            source: 'bot',
                            strategy: this.strategy.name
                        });
                        console.log(`      💾 Ордер сохранен в БД`);
                    } catch (dbError) {
                        console.warn(`      ⚠️  Ошибка сохранения в БД:`, getErrorMessage(dbError));
                    }
                }

                // Отправляем нотификацию в Telegram
                if (this.telegramBot) {
                    await this.telegramBot.notifyOrderPlaced(
                        order.orderID,
                        signal.side,
                        tokenOutcome,
                        signal.price,
                        signal.size,
                        signal.market.question
                    ).catch(err => console.warn('Failed to send Telegram notification:', getErrorMessage(err)));
                }
            } else {
                console.log(`      ❌ Ошибка размещения: ${order.errorMsg}`);

                // Отправляем нотификацию об ошибке в Telegram
                if (this.telegramBot) {
                    await this.telegramBot.notifyOrderError(
                        signal.market.question,
                        order.errorMsg || 'Unknown error'
                    ).catch(err => console.warn('Failed to send Telegram notification:', getErrorMessage(err)));
                }
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`      ❌ Ошибка: ${errorMessage}`);
        }
    }

    /**
     * Основной цикл работы бота
     */
    async run(): Promise<void> {
        if (this.isRunning) return;

        this.isRunning = true;
        console.log("🚀 Запуск AI Bot...\n");

        while (this.isRunning) {
            try {
                console.log(`\n${"═".repeat(70)}`);
                console.log(`⏰ ${new Date().toLocaleString()}`);
                console.log(`${"═".repeat(70)}`);

                // Получаем рынки через AI фильтрацию
                console.log("\n🔍 ЭТАП 1: Получение и фильтрация рынков");
                console.log("─".repeat(70));
                const markets = await this.getActiveMarkets();

                console.log(`\n📊 Результат фильтрации: ${markets.length} рынков для анализа`);

                if (markets.length === 0) {
                    console.log("   ℹ️  Нет подходящих рынков, ожидание...");
                    await new Promise(resolve => setTimeout(resolve, BOT_CONFIG.updateInterval));
                    continue;
                }

                // Обрабатываем каждый рынок
                console.log(`\n🔍 ЭТАП 2: Анализ и генерация сигналов для ${markets.length} рынков`);
                console.log("─".repeat(70));
                
                let processedCount = 0;
                for (const market of markets) {
                    processedCount++;
                    console.log(`\n[${processedCount}/${markets.length}] Обработка рынка...`);
                    await this.processSignals(market);
                }
                
                console.log(`\n✅ Обработано ${processedCount} рынков`);

                console.log(`\n💤 Ожидание ${BOT_CONFIG.updateInterval / 1000} секунд до следующего цикла...`);
                await new Promise(resolve => setTimeout(resolve, BOT_CONFIG.updateInterval));

            } catch (error: unknown) {
                console.error("❌ Ошибка в цикле бота:", getErrorMessage(error));
                await new Promise(resolve => setTimeout(resolve, 10000)); // Пауза 10 сек при ошибке
            }
        }
    }

    async stop(): Promise<void> {
        console.log("\n🛑 Остановка бота...");
        this.isRunning = false;

        // Закрываем соединение с БД
        if (this.db) {
            try {
                await this.db.disconnect();
            } catch (error) {
                console.warn("⚠️  Ошибка отключения БД:", getErrorMessage(error));
            }
        }
    }
}

// Запуск бота
async function main() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║               AI-POWERED POLYMARKET BOT                        ║
║       Использует AI для выбора рынков (подход Poly-Trader)    ║
╚════════════════════════════════════════════════════════════════╝
`);

    const strategy = new AIStrategy(STRATEGY_CONFIG);

    // Создаем бота
    const bot = new PolymarketAIBot(strategy);

    try {
        await bot.initialize();

        // Обработка graceful shutdown
        const { setupGracefulShutdown } = await import('./utils/graceful-shutdown');
        setupGracefulShutdown(bot);

        // Запускаем основной цикл
        await bot.run();

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error("❌ Критическая ошибка:", errorMessage);
        if (errorStack) {
            console.error(errorStack);
        }
        process.exit(1);
    }
}

// Запуск
if (require.main === module) {
    main().catch(console.error);
}

