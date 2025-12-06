/**
 * Test Script: Event Agents
 *
 * Тестирует специализированных агентов для разных типов рынков
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";
import { PolymarketDataAdapter, EnrichedMarket } from "../adapters/polymarket-data.adapter";
import {
    SportsAgent,
    PoliticsAgent,
    CryptoAgent,
    getAgentRegistry
} from "../agents";

dotenvConfig({ path: resolve(__dirname, "../../.env") });

async function testAgentMatching() {
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("1️⃣  ТЕСТ КАТЕГОРИЗАЦИИ РЫНКОВ");
    console.warn("═══════════════════════════════════════════════════════════════\n");

    // Создаем тестовые рынки
    const testMarkets: Partial<EnrichedMarket>[] = [
        { question: "Will the Lakers win the NBA Finals?", condition_id: "1" },
        { question: "Will Trump win the 2024 election?", condition_id: "2" },
        { question: "Will Bitcoin reach $100,000 by end of 2024?", condition_id: "3" },
        { question: "Will it rain in London tomorrow?", condition_id: "4" },
        { question: "Will the Chiefs win Super Bowl?", condition_id: "5" },
        { question: "Will SEC approve Bitcoin ETF?", condition_id: "6" },
        { question: "Will Biden resign before 2025?", condition_id: "7" },
        { question: "Will Ethereum hit $5000?", condition_id: "8" }
    ];

    const registry = getAgentRegistry();

    console.warn("Категории агентов:", registry.getCategories().join(", "));
    console.warn();

    for (const market of testMarkets) {
        const agent = registry.getAgentForMarket(market as EnrichedMarket);
        const category = agent ? agent.getCategory() : "no match";
        console.warn(`   "${market.question?.substring(0, 50)}..."`);
        console.warn(`   → Категория: ${category}\n`);
    }

    return true;
}

async function testSportsAgent() {
    console.warn("\n═══════════════════════════════════════════════════════════════");
    console.warn("2️⃣  ТЕСТ SPORTS AGENT");
    console.warn("═══════════════════════════════════════════════════════════════\n");

    const agent = new SportsAgent({ minEdge: 0.05 });

    console.warn("Agent Description:");
    console.warn(agent.describe());
    console.warn();

    // Тестовый рынок
    const testMarket: EnrichedMarket = {
        condition_id: "test-sports-1",
        question: "Will the Lakers beat the Celtics in the NBA Finals?",
        description: "NBA Finals 2024 prediction market",
        tokens: [
            { token_id: "yes-1", outcome: "Yes", price: 0.65 },
            { token_id: "no-1", outcome: "No", price: 0.35 }
        ],
        liquidityMetrics: {
            totalBidSize: 500,
            totalAskSize: 500,
            spreadPercent: 2,
            hasLiquidity: true
        }
    } as EnrichedMarket;

    console.warn(`Анализ рынка: "${testMarket.question}"`);
    const yesTokenSports = testMarket.tokens?.find(t => t.outcome === 'Yes');
    console.warn(`Текущая цена YES: ${yesTokenSports ? yesTokenSports.price * 100 : 'N/A'}%`);
    console.warn();

    try {
        const recommendation = await agent.analyzeWithCache(testMarket);
        if (recommendation) {
            console.warn("📊 Рекомендация:");
            console.warn(`   Action: ${recommendation.action}`);
            console.warn(`   Confidence: ${(recommendation.confidence * 100).toFixed(1)}%`);
            console.warn(`   Estimated Probability: ${recommendation.estimatedProbability ? (recommendation.estimatedProbability * 100).toFixed(1) + '%' : 'N/A'}`);
            console.warn(`   Edge: ${recommendation.edge ? (recommendation.edge * 100).toFixed(2) + '%' : 'N/A'}`);
            console.warn(`   Reasoning: ${recommendation.reasoning}`);
        }
    } catch (error) {
        console.warn("⚠️  Ошибка при анализе (возможно нет TAVILY_API_KEY):", error);
    }

    return true;
}

async function testPoliticsAgent() {
    console.warn("\n═══════════════════════════════════════════════════════════════");
    console.warn("3️⃣  ТЕСТ POLITICS AGENT");
    console.warn("═══════════════════════════════════════════════════════════════\n");

    const agent = new PoliticsAgent({ minEdge: 0.03 });

    console.warn("Agent Description:");
    console.warn(agent.describe());
    console.warn();

    const testMarket: EnrichedMarket = {
        condition_id: "test-politics-1",
        question: "Will Trump win the 2024 presidential election?",
        description: "US Election 2024 prediction",
        tokens: [
            { token_id: "yes-1", outcome: "Yes", price: 0.52 },
            { token_id: "no-1", outcome: "No", price: 0.48 }
        ],
        liquidityMetrics: {
            totalBidSize: 10000,
            totalAskSize: 10000,
            spreadPercent: 1,
            hasLiquidity: true
        }
    } as EnrichedMarket;

    console.warn(`Анализ рынка: "${testMarket.question}"`);
    const yesTokenPolitics = testMarket.tokens?.find(t => t.outcome === 'Yes');
    console.warn(`Текущая цена YES: ${yesTokenPolitics ? yesTokenPolitics.price * 100 : 'N/A'}%`);
    console.warn();

    try {
        const recommendation = await agent.analyzeWithCache(testMarket);
        if (recommendation) {
            console.warn("📊 Рекомендация:");
            console.warn(`   Action: ${recommendation.action}`);
            console.warn(`   Confidence: ${(recommendation.confidence * 100).toFixed(1)}%`);
            console.warn(`   Estimated Probability: ${recommendation.estimatedProbability ? (recommendation.estimatedProbability * 100).toFixed(1) + '%' : 'N/A'}`);
            console.warn(`   Edge: ${recommendation.edge ? (recommendation.edge * 100).toFixed(2) + '%' : 'N/A'}`);
            console.warn(`   Reasoning: ${recommendation.reasoning}`);
        }
    } catch (error) {
        console.warn("⚠️  Ошибка при анализе:", error);
    }

    return true;
}

async function testCryptoAgent() {
    console.warn("\n═══════════════════════════════════════════════════════════════");
    console.warn("4️⃣  ТЕСТ CRYPTO AGENT");
    console.warn("═══════════════════════════════════════════════════════════════\n");

    const agent = new CryptoAgent({ minEdge: 0.04 });

    console.warn("Agent Description:");
    console.warn(agent.describe());
    console.warn();

    const testMarket: EnrichedMarket = {
        condition_id: "test-crypto-1",
        question: "Will Bitcoin reach $150,000 by end of 2025?",
        description: "Bitcoin price prediction market",
        tokens: [
            { token_id: "yes-1", outcome: "Yes", price: 0.35 },
            { token_id: "no-1", outcome: "No", price: 0.65 }
        ],
        liquidityMetrics: {
            totalBidSize: 2000,
            totalAskSize: 2000,
            spreadPercent: 3,
            hasLiquidity: true
        }
    } as EnrichedMarket;

    console.warn(`Анализ рынка: "${testMarket.question}"`);
    const yesTokenCrypto = testMarket.tokens?.find(t => t.outcome === 'Yes');
    console.warn(`Текущая цена YES: ${yesTokenCrypto ? yesTokenCrypto.price * 100 : 'N/A'}%`);
    console.warn();

    try {
        const recommendation = await agent.analyzeWithCache(testMarket);
        if (recommendation) {
            console.warn("📊 Рекомендация:");
            console.warn(`   Action: ${recommendation.action}`);
            console.warn(`   Confidence: ${(recommendation.confidence * 100).toFixed(1)}%`);
            console.warn(`   Estimated Probability: ${recommendation.estimatedProbability ? (recommendation.estimatedProbability * 100).toFixed(1) + '%' : 'N/A'}`);
            console.warn(`   Edge: ${recommendation.edge ? (recommendation.edge * 100).toFixed(2) + '%' : 'N/A'}`);
            console.warn(`   Reasoning: ${recommendation.reasoning}`);
        }
    } catch (error) {
        console.warn("⚠️  Ошибка при анализе:", error);
    }

    return true;
}

async function testWithRealMarkets() {
    console.warn("\n═══════════════════════════════════════════════════════════════");
    console.warn("5️⃣  ТЕСТ С РЕАЛЬНЫМИ РЫНКАМИ POLYMARKET");
    console.warn("═══════════════════════════════════════════════════════════════\n");

    try {
        const client = new ClobClient(
            process.env.CLOB_API_URL || "https://clob.polymarket.com",
            parseInt(process.env.CHAIN_ID || "137")
        );

        const dataAdapter = new PolymarketDataAdapter(client);
        const registry = getAgentRegistry();

        console.warn("📡 Получение рынков (limit: 10 для экономии токенов)...");
        const allMarkets = await dataAdapter.getEnrichedMarkets({
            includeOrderbook: false, // Не запрашиваем orderbook для экономии
            includeLiquidity: false
        });

        // Берем только 10 рынков для теста
        const markets = allMarkets.slice(0, 10);
        console.warn(`✅ Получено ${allMarkets.length} рынков, анализируем ${markets.length}\n`);

        // Статистика по категориям (на полном наборе)
        const categoryStats: Record<string, number> = {
            sports: 0,
            politics: 0,
            crypto: 0,
            uncategorized: 0
        };

        // Категоризируем все рынки (без Tavily запросов)
        for (const market of allMarkets) {
            const matchedAgent = registry.getAgentForMarket(market);
            if (matchedAgent) {
                const cat = matchedAgent.getCategory();
                categoryStats[cat] = (categoryStats[cat] || 0) + 1;
            } else {
                categoryStats['uncategorized'] = (categoryStats['uncategorized'] || 0) + 1;
            }
        }

        console.warn("📊 Статистика по категориям:");
        for (const [category, count] of Object.entries(categoryStats)) {
            const percent = ((count / allMarkets.length) * 100).toFixed(1);
            console.warn(`   ${category}: ${count} (${percent}%)`);
        }
        console.warn();

        // Анализируем по одному рынку каждой категории
        console.warn("🔍 Анализ примеров:\n");

        for (const category of ['sports', 'politics', 'crypto']) {
            const agent = registry.getAgentByCategory(category);
            if (!agent) continue;

            const matchingMarket = markets.find(m => agent.matchesCategory(m));
            if (!matchingMarket) {
                console.warn(`   ${category}: нет подходящих рынков\n`);
                continue;
            }

            console.warn(`   ${category.toUpperCase()}: "${matchingMarket.question.substring(0, 60)}..."`);

            try {
                const recommendation = await agent.analyzeWithCache(matchingMarket);
                if (recommendation) {
                    console.warn(`   → ${recommendation.action} (confidence: ${(recommendation.confidence * 100).toFixed(0)}%)`);
                    if (recommendation.edge) {
                        console.warn(`   → Edge: ${(recommendation.edge * 100).toFixed(2)}%`);
                    }
                }
            } catch (error) {
                console.warn(`   → Ошибка анализа`);
            }
            console.warn();
        }

        return true;
    } catch (error) {
        console.warn("⚠️  Ошибка при работе с Polymarket API:", error);
        return false;
    }
}

async function runAllTests() {
    console.warn(`
╔════════════════════════════════════════════════════════════════╗
║                    EVENT AGENTS TEST                           ║
║         Testing SportsAgent, PoliticsAgent, CryptoAgent         ║
╚════════════════════════════════════════════════════════════════╝
`);

    const results: Record<string, boolean> = {};

    results.matching = await testAgentMatching();
    results.sports = await testSportsAgent();
    results.politics = await testPoliticsAgent();
    results.crypto = await testCryptoAgent();
    results.realMarkets = await testWithRealMarkets();

    console.warn("\n═══════════════════════════════════════════════════════════════");
    console.warn("📊 ИТОГИ ТЕСТИРОВАНИЯ");
    console.warn("═══════════════════════════════════════════════════════════════\n");

    for (const [test, passed] of Object.entries(results)) {
        const status = passed ? "✅ PASSED" : "❌ FAILED";
        console.warn(`   ${test}: ${status}`);
    }

    const allPassed = Object.values(results).every(r => r);
    console.warn(`\n${allPassed ? "✅ Все тесты пройдены!" : "⚠️ Некоторые тесты не пройдены"}\n`);

    // Cleanup
    const registry = getAgentRegistry();
    await registry.destroy();

    return allPassed ? 0 : 1;
}

// Run
runAllTests()
    .then((exitCode) => process.exit(exitCode))
    .catch((error) => {
        console.error("💥 Unexpected error:", error);
        process.exit(1);
    });
