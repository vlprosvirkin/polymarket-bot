/**
 * Интеграционный тест бота
 * Тестирует стратегию в DEMO режиме без реальных ордеров
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";
import { BaseStrategy } from "../strategies";
import { Market, Position, StrategyConfig } from "../types";

dotenvConfig({ path: resolve(__dirname, "../../.env") });

// Конфигурация для теста
const TEST_STRATEGY_CONFIG: StrategyConfig = {
    spread: 0.02,
    orderSize: 10,
    maxPosition: 100,
    profitThreshold: 0.7,
    stopLoss: 0.3,
    minVolume: 1000,
    maxMarkets: 5, // Меньше рынков для теста
    excludeNegRisk: true,
    minPrice: 0.2,
    maxPrice: 0.8,
};

const BOT_CONFIG = {
    host: process.env.CLOB_API_URL || "https://clob.polymarket.com",
    chainId: parseInt(process.env.CHAIN_ID || "137"),
    signatureType: parseInt(process.env.SIGNATURE_TYPE || "0"),
};

class IntegrationTest {
    private client: ClobClient;
    private wallet: ethers.Wallet;
    private strategy: BaseStrategy;

    constructor() {
        if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
            throw new Error("Missing PK or FUNDER_ADDRESS in .env");
        }

        this.wallet = new ethers.Wallet(process.env.PK);
        this.client = new ClobClient(BOT_CONFIG.host, BOT_CONFIG.chainId);
        this.strategy = new BaseStrategy(TEST_STRATEGY_CONFIG);
    }

    async initialize(): Promise<void> {
        console.log("🧪 ИНТЕГРАЦИОННЫЙ ТЕСТ\n");
        console.log("⚠️  DEMO MODE: Ордера НЕ размещаются\n");

        const address = await this.wallet.getAddress();
        console.log(`👤 Адрес: ${address}`);
        console.log(`🎯 Стратегия: ${this.strategy.name}\n`);

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

        console.log("✅ Инициализирован\n");
    }

    async getTokenPrice(tokenId: string): Promise<number | null> {
        try {
            const midpoint = await this.client.getMidpoint(tokenId);
            return parseFloat(midpoint);
        } catch (error) {
            return null;
        }
    }

    async testStrategy(): Promise<void> {
        console.log("=" .repeat(70));
        console.log("📊 ТЕСТ СТРАТЕГИИ");
        console.log("=".repeat(70));

        // Получаем рынки
        console.log("\n1️⃣ Получение рынков...");
        const response = await this.client.getSamplingMarkets();
        const allMarkets = response.data || [];
        console.log(`   Всего рынков: ${allMarkets.length}`);

        // Фильтруем через стратегию
        console.log("\n2️⃣ Фильтрация рынков...");
        const filtered = this.strategy.filterMarkets(allMarkets);
        console.log(`   После фильтрации: ${filtered.length}`);

        if (filtered.length === 0) {
            console.log("\n❌ Нет рынков, попробуй изменить фильтры в STRATEGY_CONFIG");
            return;
        }

        // Тестируем на первых 3 рынках
        const testMarkets = filtered.slice(0, 3);
        console.log(`\n3️⃣ Тестируем на ${testMarkets.length} рынках:\n`);

        for (let i = 0; i < testMarkets.length; i++) {
            const market = testMarkets[i];
            await this.testMarket(market, i + 1);
        }

        console.log("\n" + "=".repeat(70));
        console.log("✅ ТЕСТ ЗАВЕРШЕН");
        console.log("=".repeat(70));
    }

    async testMarket(market: Market, index: number): Promise<void> {
        console.log(`\n${"─".repeat(70)}`);
        console.log(`📊 Рынок ${index}: ${market.question}`);
        console.log(`${"─".repeat(70)}`);

        const yesToken = market.tokens[0];
        const price = await this.getTokenPrice(yesToken.token_id);

        if (!price) {
            console.log("   ❌ Не удалось получить цену");
            return;
        }

        console.log(`\n💰 Цена YES: ${(price * 100).toFixed(2)}%`);
        console.log(`📦 Объем: $${market.volume || "0"}`);
        console.log(`🏷️  Min order size: ${market.minimum_order_size}`);
        console.log(`📏 Min tick size: ${market.minimum_tick_size}`);

        // Генерируем сигналы
        const signals = this.strategy.generateSignals(market, price);
        console.log(`\n📈 Сигналов: ${signals.length}`);

        for (const signal of signals) {
            const valid = this.strategy.validateSignal(signal);
            console.log(`\n   ${valid ? '✅' : '❌'} ${signal.side}: ${signal.size} @ ${(signal.price * 100).toFixed(2)}%`);
            console.log(`      ${signal.reason}`);
            if (!valid) {
                console.log(`      ⚠️  Невалидный сигнал`);
            }
        }

        // Тестируем закрытие позиции
        const testPosition: Position = {
            tokenId: yesToken.token_id,
            market: market.question,
            size: 50,
            averagePrice: 0.5,
            timestamp: Date.now()
        };

        const shouldClose = this.strategy.shouldClosePosition(market, testPosition, price);
        const pnl = this.strategy.calculatePnL(testPosition, price);

        console.log(`\n💼 Тест позиции (50 @ 50%):`);
        console.log(`   Текущая цена: ${(price * 100).toFixed(2)}%`);
        console.log(`   P&L: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)} USDC`);
        console.log(`   Закрыть?: ${shouldClose ? '✅ ДА' : '❌ НЕТ'}`);

        if (shouldClose) {
            const reason = price >= this.strategy.config.profitThreshold
                ? `Профит (>${(this.strategy.config.profitThreshold * 100).toFixed(0)}%)`
                : price <= (this.strategy.config.stopLoss || 0)
                    ? `Stop Loss (<${((this.strategy.config.stopLoss || 0) * 100).toFixed(0)}%)`
                    : 'Другая причина';
            console.log(`   Причина: ${reason}`);
        }
    }
}

async function main() {
    const test = new IntegrationTest();

    try {
        await test.initialize();
        await test.testStrategy();
    } catch (error: any) {
        console.error("\n💥 Ошибка:", error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
