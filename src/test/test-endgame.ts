/**
 * Тест Endgame Sweep Strategy
 * Тестирует арбитраж на разрешении событий с хеджированием
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";
import { EndgameStrategy, EndgameConfig } from "../strategies/EndgameStrategy";
import { Market } from "../types";

dotenvConfig({ path: resolve(__dirname, "../../.env") });

// Конфигурация Endgame стратегии
const STRATEGY_CONFIG: EndgameConfig = {
    spread: 0, // Не используется
    orderSize: 1000, // $1000 на сделку
    maxPosition: 10000,
    profitThreshold: 0, // Не используется
    stopLoss: 0, // Не используется

    // Специфичные параметры Endgame
    maxAcceptableLoss: 0.20, // Макс 20% убыток при черном лебеде
    minProbability: 0.95, // Минимум 95%
    maxProbability: 0.99, // Максимум 99%
    maxDaysToResolution: 14, // Разрешение в течение 14 дней
    earlyExitThreshold: 0.99, // Ранний выход при 99%

    // Фильтры рынков
    minVolume: 10000, // Минимум $10k объема
    maxMarkets: 10,
    excludeNegRisk: true,
    minPrice: 0.95,
    maxPrice: 0.99,
};

const BOT_CONFIG = {
    host: process.env.CLOB_API_URL || "https://clob.polymarket.com",
    chainId: parseInt(process.env.CHAIN_ID || "137"),
    signatureType: parseInt(process.env.SIGNATURE_TYPE || "0"),
};

class EndgameTest {
    private client: ClobClient;
    private wallet: ethers.Wallet;
    private strategy: EndgameStrategy;

    constructor() {
        if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
            throw new Error("Missing PK or FUNDER_ADDRESS in .env");
        }

        this.wallet = new ethers.Wallet(process.env.PK);
        this.client = new ClobClient(BOT_CONFIG.host, BOT_CONFIG.chainId);
        this.strategy = new EndgameStrategy(STRATEGY_CONFIG);
    }

    async initialize(): Promise<void> {
        console.log("🎲 ENDGAME SWEEP STRATEGY TEST\n");
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
        console.log("📊 ПОИСК РЫНКОВ В ЭНДГЕЙМЕ (95-99%)");
        console.log("=".repeat(70));

        // Получаем все рынки
        console.log("\n1️⃣ Получение всех рынков...");
        const response = await this.client.getSamplingMarkets();
        const allMarkets = response.data || [];
        console.log(`   Всего рынков: ${allMarkets.length}`);

        // Считаем рынки в эндгейме
        const endgameMarkets = allMarkets.filter(m => {
            const yesToken = m.tokens?.find((t: any) => t.outcome === "Yes");
            return yesToken && yesToken.price >= 0.95 && yesToken.price <= 0.99;
        });
        console.log(`   В эндгейме (95-99%): ${endgameMarkets.length}`);

        // Фильтруем через стратегию
        console.log("\n2️⃣ Фильтрация (с проверкой даты разрешения)...");
        const filtered = this.strategy.filterMarkets(allMarkets);
        console.log(`   После фильтрации: ${filtered.length}`);

        if (filtered.length === 0) {
            console.log("\n❌ Нет подходящих рынков в эндгейме");
            console.log("   Попробуй:");
            console.log("   - Увеличить maxDaysToResolution до 30");
            console.log("   - Уменьшить minVolume");
            console.log("   - Расширить диапазон до 0.90-0.99");
            return;
        }

        // Тестируем найденные рынки
        console.log(`\n3️⃣ Топ ${filtered.length} рынков в эндгейме:\n`);

        for (let i = 0; i < Math.min(filtered.length, 5); i++) {
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

        // Информация о рынке
        const now = new Date();
        const endDate = new Date(market.end_date_iso);
        const daysUntilEnd = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

        console.log(`\n💰 Цены:`);
        console.log(`   YES: ${(yesPrice * 100).toFixed(2)}%`);
        console.log(`   NO:  ${(noPrice * 100).toFixed(2)}%`);
        console.log(`\n📊 Рынок:`);
        console.log(`   Объем: $${parseFloat(market.volume || "0").toLocaleString()}`);
        console.log(`   Разрешение: ${endDate.toLocaleDateString()} (${daysUntilEnd.toFixed(1)} дней)`);

        // Анализ сделки
        const tradeAnalysis = this.strategy.analyzeTradeSetup(market, yesPrice);

        console.log(`\n${tradeAnalysis.analysis}`);

        if (!tradeAnalysis.valid) {
            console.log(`\n❌ Сделка не рекомендуется`);
            return;
        }

        // Генерируем сигналы
        const signals = this.strategy.generateSignals(market, yesPrice);
        console.log(`\n📈 Сигналов для входа: ${signals.length}`);

        for (const signal of signals) {
            const valid = this.strategy.validateSignal(signal);
            const tokenOutcome = market.tokens.find(t => t.token_id === signal.tokenId)?.outcome;

            console.log(`\n   ${valid ? '✅' : '❌'} ${signal.side} ${tokenOutcome}`);
            console.log(`      ${signal.reason}`);
        }

        // Расчет годовой доходности (APY)
        if (tradeAnalysis.valid && daysUntilEnd > 0) {
            const totalCost = tradeAnalysis.hedge.yesCost + tradeAnalysis.hedge.noCost;
            const profit = tradeAnalysis.hedge.netProfitIfWin;
            const roi = (profit / totalCost) * 100;
            const apy = (roi / daysUntilEnd) * 365;

            console.log(`\n📈 Оценка доходности:`);
            console.log(`   ROI: ${roi.toFixed(2)}% за ${daysUntilEnd.toFixed(1)} дней`);
            console.log(`   APY: ~${apy.toFixed(2)}% годовых`);
        }
    }
}

async function main() {
    const test = new EndgameTest();

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
