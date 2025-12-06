import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";
// import { Market } from "../types/market"; // Не используется

dotenvConfig({ path: resolve(__dirname, "../../.env") });

async function debug() {
    console.warn("🔍 Диагностика фильтрации рынков\n");
    
    const client = new ClobClient("https://clob.polymarket.com", 137);
    const response = await client.getSamplingMarkets();
    const markets = response.data || [];
    
    console.warn(`📊 Всего рынков из API: ${markets.length}\n`);
    
    // Шаг 1: Активные
    const step1 = markets.filter(m => m.active && !m.closed && m.accepting_orders);
    console.warn(`1️⃣  Активные: ${step1.length}`);
    
    // Шаг 2: С токенами
    const step2 = step1.filter(m => m.tokens && m.tokens.length > 0);
    console.warn(`2️⃣  С токенами: ${step2.length}`);
    
    // Шаг 3: Объем
    const step3 = step2.filter(m => {
        const vol = parseFloat(m.volume || "0");
        return vol >= 5000;
    });
    console.warn(`3️⃣  Объем >= $5000: ${step3.length}`);
    
    // Шаг 4: NegRisk
    const step4 = step3.filter(m => !m.neg_risk);
    console.warn(`4️⃣  Без NegRisk: ${step4.length}`);
    
    // Шаг 5: Цена
    const step5 = step4.filter(m => {
        const yesToken = m.tokens.find((t: any) => t.outcome === 'Yes');
        if (!yesToken) return false;
        const price = yesToken.price;
        return price >= 0.70 && price <= 0.99;
    });
    console.warn(`5️⃣  Цена 70-99%: ${step5.length}\n`);
    
    // Показываем где теряются рынки
    if (step5.length === 0) {
        console.warn("❌ Проблема: все рынки отсеяны на шаге:");
        
        if (step4.length === 0 && step3.length > 0) {
            console.warn("   → Шаг 4 (NegRisk) отсеял все");
            console.warn(`   Примеры рынков с NegRisk:`);
            step3.slice(0, 3).forEach((m: any) => {
                console.warn(`   - ${m.question.substring(0, 60)}... (negRisk: ${m.neg_risk})`);
            });
        } else if (step3.length === 0 && step2.length > 0) {
            console.warn("   → Шаг 3 (Объем) отсеял все");
            console.warn(`   Примеры объемов:`);
            step2.slice(0, 5).forEach((m: any) => {
                const vol = parseFloat(m.volume || "0");
                console.warn(`   - ${m.question.substring(0, 50)}...: $${vol.toFixed(2)}`);
            });
        } else if (step5.length === 0 && step4.length > 0) {
            console.warn("   → Шаг 5 (Цена) отсеял все");
            console.warn(`   Примеры цен:`);
            step4.slice(0, 5).forEach((m: any) => {
                const yesToken = m.tokens.find((t: any) => t.outcome === 'Yes');
                const price = yesToken ? yesToken.price : 0;
                console.warn(`   - ${m.question.substring(0, 50)}...: ${(price * 100).toFixed(1)}%`);
            });
        }
    } else {
        console.warn(`✅ Найдено ${step5.length} подходящих рынков после базовой фильтрации`);
    }
}

debug().catch(console.error);
