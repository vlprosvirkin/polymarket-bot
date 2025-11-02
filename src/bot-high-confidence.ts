/**
 * Бот с High Confidence Strategy
 * Для запуска: ts-node src/bot-high-confidence.ts
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { HighConfidenceStrategy } from "./strategies";
import {
    Market,
    Position,
    StrategyConfig,
    OrderSide,
    TradeSignal
} from "./types";

dotenvConfig({ path: resolve(__dirname, "../.env") });

// Конфигурация High Confidence стратегии
const STRATEGY_CONFIG: StrategyConfig = {
    spread: 0, // Не используется
    orderSize: 100, // 100 токенов: 90 YES + 10 NO
    maxPosition: 1000,
    profitThreshold: 0.95, // Закрывать при 95%
    stopLoss: 0.75, // Stop loss при падении до 75%
    minVolume: 5000, // Минимум $5000 объема
    maxMarkets: 5, // Макс 5 рынков одновременно
    excludeNegRisk: true,
    minPrice: 0.80, // Главный фильтр: >= 80%
    maxPrice: 1.0,
};

const BOT_CONFIG = {
    host: process.env.CLOB_API_URL || "https://clob.polymarket.com",
    chainId: parseInt(process.env.CHAIN_ID || "137"),
    signatureType: parseInt(process.env.SIGNATURE_TYPE || "0"),
    updateInterval: 30000, // Проверка каждые 30 секунд
};

class HighConfidenceBot {
    private client: ClobClient;
    private wallet: ethers.Wallet;
    private strategy: HighConfidenceStrategy;
    private isRunning: boolean = false;
    private positions: Map<string, Position> = new Map();

    constructor(strategy: HighConfidenceStrategy) {
        if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
            throw new Error("Missing PK or FUNDER_ADDRESS in .env");
        }

        this.wallet = new ethers.Wallet(process.env.PK);
        this.client = new ClobClient(BOT_CONFIG.host, BOT_CONFIG.chainId);
        this.strategy = strategy;
    }

    async initialize(): Promise<void> {
        console.log("🤖 High Confidence Bot\n");

        const address = await this.wallet.getAddress();
        console.log(`👤 Адрес: ${address}`);
        console.log(`🎯 Стратегия: ${this.strategy.name}`);
        console.log(`🔗 CLOB API: ${BOT_CONFIG.host}\n`);

        console.log(this.strategy.getDescription());

        console.log("\n🔑 Получение API ключей...");
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

        console.log("✅ Инициализирован\n");
    }

    async getActiveMarkets(): Promise<Market[]> {
        const response = await this.client.getSamplingMarkets();
        const markets = response.data || [];
        return this.strategy.filterMarkets(markets);
    }

    async getTokenPrice(tokenId: string): Promise<number | null> {
        try {
            const midpoint = await this.client.getMidpoint(tokenId);
            return parseFloat(midpoint);
        } catch (error) {
            return null;
        }
    }

    async processSignals(market: Market): Promise<void> {
        if (!market.tokens || market.tokens.length === 0) return;

        const yesToken = market.tokens.find(t => t.outcome === "Yes");
        if (!yesToken) return;

        const currentPrice = await this.getTokenPrice(yesToken.token_id);
        if (!currentPrice) return;

        const position = this.positions.get(yesToken.token_id);

        console.log(`\n📊 ${market.question}`);
        console.log(`   YES: ${(currentPrice * 100).toFixed(2)}%`);

        if (position) {
            const pnl = this.strategy.calculatePnL(position, currentPrice);
            console.log(`   Позиция: ${position.size} @ ${(position.averagePrice * 100).toFixed(2)}%`);
            console.log(`   P&L: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)} USDC`);
        }

        // Генерируем сигналы
        const signals = this.strategy.generateSignals(market, currentPrice, position);

        for (const signal of signals) {
            if (!this.strategy.validateSignal(signal)) {
                console.log(`   ⚠️  Невалидный сигнал`);
                continue;
            }

            const tokenOutcome = market.tokens.find(t => t.token_id === signal.tokenId)?.outcome;
            console.log(`   📈 ${signal.side} ${tokenOutcome}: ${signal.size} @ ${(signal.price * 100).toFixed(2)}%`);
            console.log(`      ${signal.reason}`);

            await this.executeSignal(signal);
        }

        // Проверяем закрытие
        if (position && this.strategy.shouldClosePosition(market, position, currentPrice)) {
            await this.closePosition(market, position, currentPrice);
        }
    }

    async executeSignal(signal: TradeSignal): Promise<void> {
        try {
            const order = await this.client.createAndPostOrder(
                {
                    tokenID: signal.tokenId,
                    price: signal.price,
                    side: signal.side as any,
                    size: signal.size,
                },
                {
                    tickSize: signal.market.minimum_tick_size.toString() as any,
                    negRisk: signal.market.neg_risk
                },
                OrderType.GTC
            );

            if (order.success) {
                console.log(`   ✅ Ордер размещен: ${order.orderID}`);

                if (signal.side === OrderSide.BUY) {
                    this.updatePosition(signal.tokenId, signal.market.question, signal.size, signal.price);
                }
            } else {
                console.log(`   ❌ Ошибка: ${order.errorMsg}`);
            }

        } catch (error: any) {
            console.error(`   ❌ Ошибка исполнения:`, error.message);
        }
    }

    async closePosition(market: Market, position: Position, currentPrice: number): Promise<void> {
        const pnl = this.strategy.calculatePnL(position, currentPrice);
        const reason = currentPrice >= this.strategy.config.profitThreshold
            ? `Профит: ${(currentPrice * 100).toFixed(2)}%`
            : currentPrice <= (this.strategy.config.stopLoss || 0)
                ? `Stop Loss: ${(currentPrice * 100).toFixed(2)}%`
                : 'Другая причина';

        console.log(`\n💰 ЗАКРЫТИЕ ПОЗИЦИИ: ${market.question}`);
        console.log(`   Причина: ${reason}`);
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

        } catch (error: any) {
            console.error(`   ❌ Ошибка закрытия:`, error.message);
        }
    }

    private updatePosition(tokenId: string, market: string, size: number, price: number): void {
        const existing = this.positions.get(tokenId);

        if (existing) {
            const totalSize = existing.size + size;
            const totalCost = (existing.size * existing.averagePrice) + (size * price);
            existing.size = totalSize;
            existing.averagePrice = totalCost / totalSize;
        } else {
            this.positions.set(tokenId, {
                tokenId,
                market,
                size,
                averagePrice: price,
                timestamp: Date.now()
            });
        }
    }

    async run(): Promise<void> {
        this.isRunning = true;
        console.log("🚀 Запуск бота...\n");
        console.log("⚠️  РЕАЛЬНАЯ ТОРГОВЛЯ: Ордера будут размещаться!\n");

        while (this.isRunning) {
            try {
                console.log(`\n${"=".repeat(70)}`);
                console.log(`⏰ ${new Date().toLocaleString()}`);
                console.log("=".repeat(70));

                const markets = await this.getActiveMarkets();
                console.log(`\n📊 Найдено рынков с вероятностью >= 80%: ${markets.length}`);

                for (const market of markets) {
                    await this.processSignals(market);
                }

                if (this.positions.size > 0) {
                    console.log(`\n📈 Открытых позиций: ${this.positions.size}`);
                }

                console.log(`\n⏳ Ожидание ${BOT_CONFIG.updateInterval / 1000} секунд...`);
                await this.sleep(BOT_CONFIG.updateInterval);

            } catch (error: any) {
                console.error("\n❌ Ошибка:", error.message);
                console.log("⏳ Пауза 60 секунд...");
                await this.sleep(60000);
            }
        }
    }

    stop(): void {
        console.log("\n🛑 Остановка бота...");
        this.isRunning = false;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

async function main() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║              HIGH CONFIDENCE TRADING BOT                       ║
║         Рынки с вероятностью 80%+: 90% YES / 10% NO          ║
╚════════════════════════════════════════════════════════════════╝
`);

    const strategy = new HighConfidenceStrategy(STRATEGY_CONFIG);
    const bot = new HighConfidenceBot(strategy);

    try {
        await bot.initialize();

        process.on('SIGINT', () => {
            console.log('\n\n⚠️  Получен SIGINT (Ctrl+C)');
            bot.stop();
            setTimeout(() => process.exit(0), 1000);
        });

        process.on('SIGTERM', () => {
            console.log('\n\n⚠️  Получен SIGTERM');
            bot.stop();
            setTimeout(() => process.exit(0), 1000);
        });

        await bot.run();

    } catch (error: any) {
        console.error("\n💥 Критическая ошибка:", error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

export { HighConfidenceBot };
