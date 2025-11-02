import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";
import { AIStrategy, AIStrategyConfig } from "../strategies/AIStrategy";
import { AI_STRATEGY_CONFIG } from "../core/config";

dotenvConfig({ path: resolve(__dirname, "../../.env") });

async function test() {
    console.log("🔍 Тест AIStrategy фильтрации\n");
    
    const client = new ClobClient("https://clob.polymarket.com", 137);
    const response = await client.getSamplingMarkets();
    const markets = response.data || [];
    
    console.log(`📊 Всего рынков из API: ${markets.length}\n`);
    
    const config: AIStrategyConfig = {
        spread: 0,
        orderSize: 100,
        maxPosition: 1000,
        profitThreshold: 0.95,
        stopLoss: 0.75,
        // minVolume удален - volume не возвращается API
        maxMarkets: 5,
        excludeNegRisk: true,
        minPrice: 0.70,
        maxPrice: 0.99,
        useAI: false,  // Пока без AI для быстрой проверки
        useNews: false,
        minAIAttractiveness: AI_STRATEGY_CONFIG.DEFAULT_MIN_ATTRACTIVENESS,
        maxAIRisk: AI_STRATEGY_CONFIG.DEFAULT_MAX_RISK,
        useAIForSignals: false,
        maxMarketsForAI: AI_STRATEGY_CONFIG.MAX_MARKETS_FOR_AI
    };
    
    const strategy = new AIStrategy(config);
    
    // Тест синхронной фильтрации
    console.log("1️⃣  Синхронная фильтрация (filterMarkets):");
    const filtered = strategy.filterMarkets(markets);
    console.log(`   ✅ Найдено: ${filtered.length} рынков\n`);
    
    if (filtered.length > 0) {
        console.log("📋 Найденные рынки:");
        filtered.forEach((m, i) => {
            const yesToken = m.tokens?.find((t: any) => t.outcome === 'Yes');
            const price = yesToken ? (yesToken.price * 100).toFixed(1) : 'N/A';
            const vol = parseFloat(m.volume || "0");
            console.log(`  ${i + 1}. ${m.question.substring(0, 55)}...`);
            console.log(`     Цена: ${price}%, Объем: $${vol.toFixed(2)}, NegRisk: ${m.neg_risk}`);
        });
    } else {
        console.log("❌ Проблема: рынки не найдены");
    }
}

test().catch(console.error);
