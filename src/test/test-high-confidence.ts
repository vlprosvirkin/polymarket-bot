/**
 * Тест High Confidence Strategy
 * Тестирует стратегию заходов в рынки с вероятностью 80%+
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";
import { HighConfidenceStrategy } from "../strategies";
import { Market, Position, StrategyConfig } from "../types";

dotenvConfig({ path: resolve(__dirname, "../../.env") });

// Конфигурация для High Confidence стратегии
const STRATEGY_CONFIG: StrategyConfig = {
    spread: 0, // Не используется в этой стратегии
    orderSize: 100, // Общий размер позиции (90 YES + 10 NO)
    maxPosition: 1000, // Максимальная позиция
    profitThreshold: 0.95, // Закрывать при 95%
    stopLoss: 0.75, // Stop loss при падении ниже 75%
    minVolume: 5000, // Минимум $5000 объема
    maxMarkets: 5, // Топ 5 рынков
    excludeNegRisk: true,
    minPrice: 0.80, // Минимум 80% (главный фильтр)
    maxPrice: 1.0, // До 100%
};

const BOT_CONFIG = {
    host: process.env.CLOB_API_URL || "https://clob.polymarket.com",
    chainId: parseInt(process.env.CHAIN_ID || "137"),
    signatureType: parseInt(process.env.SIGNATURE_TYPE || "0"),
};

class HighConfidenceTest {
    private client: ClobClient;
    private wallet: ethers.Wallet;
    private strategy: HighConfidenceStrategy;

    constructor() {
        if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
            throw new Error("Missing PK or FUNDER_ADDRESS in .env");
        }

        this.wallet = new ethers.Wallet(process.env.PK);
        this.client = new ClobClient(BOT_CONFIG.host, BOT_CONFIG.chainId);
        this.strategy = new HighConfidenceStrategy(STRATEGY_CONFIG);
    }

    async initialize(): Promise<void> {
        console.log("🎯 HIGH CONFIDENCE STRATEGY TEST\n");
        console.log("⚠️  DEMO MODE: Ордера НЕ размещаются\n");

        const address = await this.wallet.getAddress();
        console.log(`👤 Адрес: ${address}`);
        console.log(`📋 Стратегия: ${this.strategy.name}\n`);
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

    async getTokenPrice(tokenId: string): Promise<number | null> {
        try {
            const midpoint = await this.client.getMidpoint(tokenId);
            return parseFloat(midpoint);
        } catch (error) {
            return null;
        }
    }

    async testStrategy(): Promise<void> {
        console.log("=".repeat(70));
        console.log("📊 ПОИСК РЫНКОВ С ВЫСОКОЙ ВЕРОЯТНОСТЬЮ");
        console.log("=".repeat(70));

        // Получаем все рынки
        console.log("\n1️⃣ Получение всех рынков...");
        const response = await this.client.getSamplingMarkets();
        const allMarkets = response.data || [];
        console.log(`   Всего рынков: ${allMarkets.length}`);

        // Считаем сколько рынков с вероятностью > 80%
        const highProbMarkets = allMarkets.filter(m => {
            const yesToken = m.tokens?.find((t: any) => t.outcome === "Yes");
            return yesToken && yesToken.price >= 0.80;
        });
        console.log(`   С вероятностью >= 80%: ${highProbMarkets.length}`);

        // Фильтруем через стратегию
        console.log("\n2️⃣ Фильтрация через стратегию...");
        const filtered = this.strategy.filterMarkets(allMarkets);
        console.log(`   После фильтрации: ${filtered.length}`);

        if (filtered.length === 0) {
            console.log("\n❌ Нет подходящих рынков");
            console.log("   Попробуй:");
            console.log("   - Уменьшить minVolume");
            console.log("   - Уменьшить minPrice до 0.75");
            return;
        }

        // Тестируем на найденных рынках
        console.log(`\n3️⃣ Топ ${filtered.length} рынков с высокой вероятностью:\n`);

        for (let i = 0; i < filtered.length; i++) {
            await this.testMarket(filtered[i], i + 1);
        }

        console.log("\n" + "=".repeat(70));
        console.log("✅ ТЕСТ ЗАВЕРШЕН");
        console.log("=".repeat(70));
    }

    async testMarket(market: Market, index: number): Promise<void> {
        console.log(`\n${"─".repeat(70)}`);
        console.log(`🎯 Рынок ${index}: ${market.question}`);
        console.log(`${"─".repeat(70)}`);

        const yesToken = market.tokens.find(t => t.outcome === "Yes");
        const noToken = market.tokens.find(t => t.outcome === "No");

        if (!yesToken || !noToken) return;

        const yesPrice = await this.getTokenPrice(yesToken.token_id);
        const noPrice = await this.getTokenPrice(noToken.token_id);

        if (!yesPrice || !noPrice) {
            console.log("   ❌ Не удалось получить цены");
            return;
        }

        console.log(`\n💰 Цены:`);
        console.log(`   YES: ${(yesPrice * 100).toFixed(2)}%`);
        console.log(`   NO:  ${(noPrice * 100).toFixed(2)}%`);
        console.log(`\n📊 Рынок:`);
        console.log(`   Объем: $${parseFloat(market.volume || "0").toLocaleString()}`);
        console.log(`   Min order: ${market.minimum_order_size}`);

        // Генерируем сигналы
        const signals = this.strategy.generateSignals(market, yesPrice);
        console.log(`\n📈 Сигналов: ${signals.length}`);

        let totalCost = 0;
        for (const signal of signals) {
            const valid = this.strategy.validateSignal(signal);
            const cost = signal.size * signal.price;
            totalCost += cost;

            console.log(`\n   ${valid ? '✅' : '❌'} ${signal.side} ${signal.tokenId.slice(0, 8)}...`);
            console.log(`      Токен: ${market.tokens.find(t => t.token_id === signal.tokenId)?.outcome}`);
            console.log(`      Размер: ${signal.size} @ ${(signal.price * 100).toFixed(2)}%`);
            console.log(`      Стоимость: ~${cost.toFixed(2)} USDC`);
            console.log(`      ${signal.reason}`);
        }

        if (signals.length > 0) {
            console.log(`\n💵 Общая стоимость входа: ~${totalCost.toFixed(2)} USDC`);

            // Симулируем позицию
            const yesSignal = signals.find(s => market.tokens.find(t => t.token_id === s.tokenId && t.outcome === "Yes"));
            if (yesSignal) {
                const testPosition: Position = {
                    tokenId: yesSignal.tokenId,
                    market: market.question,
                    size: yesSignal.size,
                    averagePrice: yesSignal.price,
                    timestamp: Date.now()
                };

                // Симулируем рост до 95%
                const targetPrice = 0.95;
                const pnl = this.strategy.calculatePnL(testPosition, targetPrice);
                const shouldClose = this.strategy.shouldClosePosition(market, testPosition, targetPrice);

                console.log(`\n📊 Симуляция при росте до 95%:`);
                console.log(`   P&L: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)} USDC`);
                console.log(`   ROI: ${((pnl / (yesSignal.size * yesSignal.price)) * 100).toFixed(2)}%`);
                console.log(`   Закрыть?: ${shouldClose ? '✅ ДА (достигнут profitThreshold)' : '❌ НЕТ'}`);
            }
        }
    }
}

async function main() {
    const test = new HighConfidenceTest();

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
