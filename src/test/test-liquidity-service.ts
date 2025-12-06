/**
 * Тест сервиса PolymarketDataService
 * Проверяем получение данных о ликвидности через orderbook
 */

import { ClobClient } from "@polymarket/clob-client";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { PolymarketDataAdapter } from "../adapters/polymarket-data.adapter";

dotenvConfig({ path: resolve(__dirname, "../../.env") });

async function testLiquidityService() {
    console.warn("🔍 ТЕСТ СЕРВИСА ЛИКВИДНОСТИ\n");
    console.warn("=".repeat(70));

    const client = new ClobClient(
        process.env.CLOB_API_URL || "https://clob.polymarket.com",
        parseInt(process.env.CHAIN_ID || "137")
    );

    const dataService = new PolymarketDataAdapter(client);

    try {
        // 1. Получаем базовые рынки
        console.warn("\n1️⃣ Получение базовых рынков...");
        const response = await client.getSamplingMarkets();
        const allMarkets = response.data || [];

        // Фильтруем рынки 80-99%
        const highProbMarkets = allMarkets.filter((m: any) => {
            const yesToken = m.tokens?.find((t: any) => t.outcome === "Yes");
            if (!yesToken) return false;
            return yesToken.price >= 0.80 && yesToken.price <= 0.99;
        });

        console.warn(`   Всего рынков: ${allMarkets.length}`);
        console.warn(`   Рынков 80-99%: ${highProbMarkets.length}`);

        // 2. Проверяем ликвидность батчем
        console.warn("\n2️⃣ Быстрая проверка ликвидности (первые 5 рынков)...");
        const marketsToCheck = highProbMarkets.slice(0, 5);
        const liquidityMap = await dataService.checkLiquidityBatch(marketsToCheck, 100);

        let withLiq = 0;
        liquidityMap.forEach(hasLiq => {
            if (hasLiq) withLiq++;
        });

        console.warn(`   Проверено: ${marketsToCheck.length}`);
        console.warn(`   С ликвидностью >= $100: ${withLiq}`);
        console.warn(`   Без ликвидности: ${marketsToCheck.length - withLiq}`);

        // 3. Получаем обогащенные данные для топ-3
        console.warn("\n3️⃣ Детальный анализ топ-3 рынков с ликвидностью:\n");

        const marketsWithLiq = marketsToCheck.filter(m =>
            liquidityMap.get(m.condition_id) === true
        );

        for (let i = 0; i < Math.min(3, marketsWithLiq.length); i++) {
            const market = marketsWithLiq[i];
            console.warn(`${"─".repeat(70)}`);
            console.warn(`${i + 1}. ${market.question}`);
            console.warn(`${"─".repeat(70)}`);

            const yesToken = market.tokens?.find((t: any) => t.outcome === "Yes");
            if (!yesToken) continue;

            console.warn(`Probability: ${(yesToken.price * 100).toFixed(2)}%`);

            // Получаем детальные данные
            const enriched = await dataService.getMarketDetails(market.condition_id);

            if (enriched?.orderbook) {
                const ob = enriched.orderbook;
                console.warn(`\n📊 Orderbook:`);
                console.warn(`   Spread: ${(ob.spread * 100).toFixed(2)}%`);
                console.warn(`   Depth: ${ob.depth.toFixed(2)} tokens`);
                console.warn(`   Bids: ${ob.bids.length} levels`);
                console.warn(`   Asks: ${ob.asks.length} levels`);

                // Топ-3 bid/ask
                if (ob.bids.length > 0) {
                    console.warn(`\n   Top 3 Bids:`);
                    ob.bids.slice(0, 3).forEach((bid, idx) => {
                        console.warn(`     ${idx + 1}. ${(parseFloat(bid.price) * 100).toFixed(2)}% - ${bid.size} tokens`);
                    });
                }

                if (ob.asks.length > 0) {
                    console.warn(`\n   Top 3 Asks:`);
                    ob.asks.slice(0, 3).forEach((ask, idx) => {
                        console.warn(`     ${idx + 1}. ${(parseFloat(ask.price) * 100).toFixed(2)}% - ${ask.size} tokens`);
                    });
                }
            }

            if (enriched?.liquidityMetrics) {
                const liq = enriched.liquidityMetrics;
                console.warn(`\n💰 Ликвидность:`);
                console.warn(`   Total Bid Size: ${liq.totalBidSize.toFixed(2)} tokens`);
                console.warn(`   Total Ask Size: ${liq.totalAskSize.toFixed(2)} tokens`);
                console.warn(`   Total: ${(liq.totalBidSize + liq.totalAskSize).toFixed(2)} tokens`);
                console.warn(`   Spread: ${liq.spreadPercent.toFixed(2)}%`);
                console.warn(`   Has Liquidity: ${liq.hasLiquidity ? '✅ Yes' : '❌ No'}`);
            }

            console.warn("\n");
        }

        // 4. SKIP - слишком долго для теста
        console.warn(`\n${"=".repeat(70)}`);
        console.warn(`✅ ТЕСТ ЗАВЕРШЕН`);
        console.warn(`${"=".repeat(70)}`);

    } catch (error: any) {
        console.error("\n❌ Ошибка:", error.message);
        console.error(error);
    }
}

testLiquidityService();
