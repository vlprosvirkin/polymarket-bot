/**
 * Гибкий тест Endgame Strategy
 * С более мягкими фильтрами для поиска возможностей
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";
import { EndgameStrategy, EndgameConfig } from "../strategies/EndgameStrategy";
import { Market } from "../types";

dotenvConfig({ path: resolve(__dirname, "../../.env") });

// Более мягкая конфигурация для поиска возможностей
const STRATEGY_CONFIG: EndgameConfig = {
    spread: 0,
    orderSize: 100, // $100 на сделку для теста
    maxPosition: 10000,
    profitThreshold: 0,
    stopLoss: 0,

    // Расширенные параметры
    maxAcceptableLoss: 0.20,
    minProbability: 0.80,        // Снижено до 80%
    maxProbability: 0.99,
    maxDaysToResolution: 999999, // Без ограничения по дате
    earlyExitThreshold: 0.99,

        // minVolume удален - volume не возвращается API
    maxMarkets: 20,
    excludeNegRisk: false,        // Включаем NegRisk рынки
    minPrice: 0.80,
    maxPrice: 0.99,
};

const BOT_CONFIG = {
    host: process.env.CLOB_API_URL || "https://clob.polymarket.com",
    chainId: parseInt(process.env.CHAIN_ID || "137"),
    signatureType: parseInt(process.env.SIGNATURE_TYPE || "0"),
};

class FlexibleEndgameTest {
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
        console.log("🎲 FLEXIBLE ENDGAME TEST (мягкие фильтры)\n");
        console.log("⚠️  DEMO MODE: Ордера НЕ размещаются\n");

        const address = await this.wallet.getAddress();
        console.log(`👤 Адрес: ${address}`);
        console.log(`📋 Параметры:`);
        console.log(`   - Вероятность: 80-99%`);
        console.log(`   - До разрешения: БЕЗ ОГРАНИЧЕНИЯ`);
        console.log(`   - Min объем: БЕЗ ФИЛЬТРА`);
        console.log(`   - NegRisk: ВКЛЮЧЕНЫ`);
        console.log(`   - Размер сделки: $100\n`);

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
        console.log("=".repeat(70));
        console.log("📊 АНАЛИЗ РЫНКОВ");
        console.log("=".repeat(70));

        // Получаем рынки с повторными попытками
        console.log("\n1️⃣ Получение рынков (может занять время)...");

        let allMarkets: Market[] = [];
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts && allMarkets.length === 0) {
            try {
                const response = await this.client.getSamplingMarkets();
                allMarkets = response.data || [];
                console.log(`   Получено рынков: ${allMarkets.length}`);
                break;
            } catch (error: any) {
                attempts++;
                console.log(`   ⚠️  Попытка ${attempts}/${maxAttempts} не удалась: ${error.message}`);
                if (attempts < maxAttempts) {
                    console.log(`   Ожидание 5 секунд...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        }

        if (allMarkets.length === 0) {
            console.log("\n❌ Не удалось получить рынки");
            console.log("   Проверь:");
            console.log("   - VPN включен?");
            console.log("   - curl https://clob.polymarket.com/sampling-markets?limit=1");
            return;
        }

        // Анализ всех рынков
        console.log("\n2️⃣ Анализ распределения вероятностей...");

        const distribution = {
            '0-50%': 0,
            '50-80%': 0,
            '80-90%': 0,
            '90-95%': 0,
            '95-99%': 0,
            '99-100%': 0
        };

        allMarkets.forEach(m => {
            const yesToken = m.tokens?.find((t: any) => t.outcome === "Yes");
            if (!yesToken) return;

            const price = yesToken.price;
            if (price < 0.5) distribution['0-50%']++;
            else if (price < 0.8) distribution['50-80%']++;
            else if (price < 0.9) distribution['80-90%']++;
            else if (price < 0.95) distribution['90-95%']++;
            else if (price < 0.99) distribution['95-99%']++;
            else distribution['99-100%']++;
        });

        console.log(`   Всего активных рынков: ${allMarkets.length}`);
        Object.entries(distribution).forEach(([range, count]) => {
            const pct = ((count / allMarkets.length) * 100).toFixed(1);
            const bar = '█'.repeat(Math.floor(count / allMarkets.length * 50));
            console.log(`   ${range.padEnd(10)} ${count.toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`);
        });

        // Анализ причин фильтрации
        console.log("\n3️⃣ Детальный анализ фильтров...");

        const highProbMarkets = allMarkets.filter(m => {
            const yesToken = m.tokens?.find((t: any) => t.outcome === "Yes");
            if (!yesToken) return false;
            return yesToken.price >= 0.80 && yesToken.price <= 0.99;
        });

        console.log(`   Рынков с вероятностью 80-99%: ${highProbMarkets.length}`);

        const withDate = highProbMarkets.filter(m => m.end_date_iso);
        const withoutDate = highProbMarkets.filter(m => !m.end_date_iso);
        console.log(`   - С датой разрешения: ${withDate.length}`);
        console.log(`   - БЕЗ даты разрешения: ${withoutDate.length}`);

        const withVolume = withDate.filter(m => parseFloat(m.volume || "0") >= 0);
        console.log(`   - С датой И любым объемом: ${withVolume.length}`);

        const withNegRisk = withVolume.filter(m => m.neg_risk);
        const withoutNegRisk = withVolume.filter(m => !m.neg_risk);
        console.log(`   - NegRisk рынки: ${withNegRisk.length}`);
        console.log(`   - Обычные рынки: ${withoutNegRisk.length}`);

        // Фильтрация через стратегию
        console.log("\n4️⃣ Применение фильтров стратегии...");
        const filtered = this.strategy.filterMarkets(allMarkets);
        console.log(`   Подходящих рынков: ${filtered.length}`);

        if (filtered.length === 0) {
            console.log("\n💡 Рекомендации:");
            console.log("   - В диапазоне 90-95%: " + distribution['90-95%'] + " рынков");
            console.log("   - В диапазоне 95-99%: " + distribution['95-99%'] + " рынков");
            console.log("   - Большинство рынков не имеют даты разрешения (end_date_iso)");
            console.log("   - Попробуй снизить minVolume или убрать фильтр excludeNegRisk");
            return;
        }

        // Показываем топ возможности
        console.log(`\n5️⃣ Топ ${Math.min(filtered.length, 5)} возможностей:\n`);

        for (let i = 0; i < Math.min(filtered.length, 5); i++) {
            const market = filtered[i];
            if (!market) continue;
            await this.analyzeMarket(market, i + 1);
        }

        console.log("\n" + "=".repeat(70));
        console.log("✅ АНАЛИЗ ЗАВЕРШЕН");
        console.log("=".repeat(70));
    }

    async analyzeMarket(market: Market, index: number): Promise<void> {
        console.log(`\n${"─".repeat(70)}`);
        console.log(`${index}. ${market.question}`);
        console.log(`${"─".repeat(70)}`);

        const yesToken = market.tokens.find(t => t.outcome === "Yes");
        const noToken = market.tokens.find(t => t.outcome === "No");

        if (!yesToken || !noToken) return;

        // Используем цену из объекта рынка вместо getMidpoint
        // (getMidpoint может не работать для неактивных рынков)
        const yesPrice = yesToken.price;
        const noPrice = 1 - yesPrice;

        // Дата разрешения
        const now = new Date();
        const endDate = market.end_date_iso ? new Date(market.end_date_iso) : null;
        const daysUntilEnd = endDate ? (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24) : null;

        // Анализ сделки
        const analysis = this.strategy.analyzeTradeSetup(market, yesPrice);

        console.log(`\n💰 Цены:`);
        console.log(`   YES: ${(yesPrice * 100).toFixed(2)}%`);
        console.log(`   NO:  ${(noPrice * 100).toFixed(2)}%`);

        console.log(`\n📊 Рынок:`);
        console.log(`   Объем: $${parseFloat(market.volume || "0").toLocaleString()}`);
        if (daysUntilEnd !== null) {
            console.log(`   Разрешение: через ${daysUntilEnd.toFixed(1)} дней`);
        }

        console.log(`\n${analysis.analysis}`);

        // Расчет APY
        if (analysis.valid && daysUntilEnd && daysUntilEnd > 0) {
            const totalCost = analysis.hedge.yesCost + analysis.hedge.noCost;
            const profit = analysis.hedge.netProfitIfWin;
            const roi = (profit / totalCost) * 100;
            const apy = (roi / daysUntilEnd) * 365;

            console.log(`\n📈 Годовая доходность:`);
            console.log(`   ROI: ${roi.toFixed(2)}% за ${daysUntilEnd.toFixed(1)} дней`);
            console.log(`   APY: ~${apy.toFixed(0)}% годовых`);

            if (apy > 100) {
                console.log(`   🔥 Высокая доходность!`);
            } else if (apy > 50) {
                console.log(`   ✅ Хорошая доходность`);
            } else {
                console.log(`   ⚠️  Низкая доходность`);
            }
        }
    }
}

async function main() {
    const test = new FlexibleEndgameTest();

    try {
        await test.initialize();
        await test.testStrategy();
    } catch (error: any) {
        console.error("\n💥 Ошибка:", error.message);
        if (error.message.includes("ECONNRESET")) {
            console.error("\n⚠️  VPN REQUIRED!");
            console.error("   Включи VPN и попробуй снова");
        }
        process.exit(1);
    }
}

main();
