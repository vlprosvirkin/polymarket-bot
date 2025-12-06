import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";
import { MarketFilter } from "../services/MarketFilter";

dotenvConfig({ path: resolve(__dirname, "../../.env") });

async function test() {
    console.warn("🔍 Тест интеграции MarketFilter\n");
    
    const client = new ClobClient("https://clob.polymarket.com", 137);
    const response = await client.getSamplingMarkets();
    const markets = response.data || [];
    
    console.warn(`📊 Всего рынков: ${markets.length}\n`);
    
    // Используем MarketFilter как в AIStrategy
    const filtered = MarketFilter.filterWithConfig(markets, {
        // minVolume удален - volume не возвращается API
        minPrice: 0.70,
        maxPrice: 0.99,
        excludeNegRisk: true
    });
    
    console.warn(`✅ После фильтрации: ${filtered.length} рынков\n`);
    
    if (filtered.length > 0) {
        console.warn("📋 Первые 5 рынков:");
        filtered.slice(0, 5).forEach((m, i) => {
            const yesToken = m.tokens?.find((t: any) => t.outcome === 'Yes');
            const price = yesToken ? (yesToken.price * 100).toFixed(1) : 'N/A';
            console.warn(`  ${i + 1}. ${m.question.substring(0, 60)}... [${price}%]`);
        });
    } else {
        console.warn("❌ Проблема: все рынки отсеяны");
        console.warn("\n🔍 Проверяем по шагам:");
        
        const step1 = MarketFilter.filterBasic(markets);
        console.warn(`  Базовая фильтрация: ${step1.length}`);
        
        const step2 = MarketFilter.filterByPrice(step1, 0.70, 0.99);
        console.warn(`  По цене (70-99%): ${step2.length}`);
        
        const step3 = MarketFilter.filterNegRisk(step2, true);
        console.warn(`  Без NegRisk: ${step3.length}`);
    }
}

test().catch(console.error);
