/**
 * Скрипт для анализа и категоризации рынков Polymarket
 *
 * Использование:
 *   npm run analyze-markets              - Категоризация всех рынков
 *   npm run analyze-markets -- --limit=50   - Анализ 50 рынков
 *   npm run analyze-markets -- --category=sports  - Только спортивные рынки
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";
import { PolymarketDataAdapter, EnrichedMarket } from "../src/adapters/polymarket-data.adapter";
import { getAgentRegistry } from "../src/agents";

dotenvConfig({ path: resolve(__dirname, "../.env") });

async function analyzeMarkets() {
    const args = process.argv.slice(2);

    // Парсим аргументы
    let limit = 0; // 0 = все рынки
    let categoryFilter: string | null = null;
    let doAnalysis = false;

    for (const arg of args) {
        if (arg.startsWith('--limit=')) {
            limit = parseInt(arg.split('=')[1] || '0');
        } else if (arg.startsWith('--category=')) {
            categoryFilter = arg.split('=')[1] || null;
        } else if (arg === '--analyze') {
            doAnalysis = true;
        }
    }

    console.log(`
╔════════════════════════════════════════════════════════════════╗
║              POLYMARKET MARKET ANALYZER                        ║
╚════════════════════════════════════════════════════════════════╝
`);

    const client = new ClobClient(
        process.env.CLOB_API_URL || "https://clob.polymarket.com",
        parseInt(process.env.CHAIN_ID || "137")
    );

    const dataAdapter = new PolymarketDataAdapter(client);
    const registry = getAgentRegistry();

    console.log("📡 Получение рынков...\n");

    const allMarkets = await dataAdapter.getEnrichedMarkets({
        includeOrderbook: false,
        includeLiquidity: false
    });

    console.log(`✅ Получено ${allMarkets.length} рынков\n`);

    // Категоризация
    const categorized: Record<string, EnrichedMarket[]> = {
        sports: [],
        politics: [],
        crypto: [],
        uncategorized: []
    };

    for (const market of allMarkets) {
        const agent = registry.getAgentForMarket(market);
        const category = agent?.getCategory() || 'uncategorized';

        if (!categorized[category]) {
            categorized[category] = [];
        }
        categorized[category].push(market);
    }

    // Статистика
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("📊 СТАТИСТИКА ПО КАТЕГОРИЯМ");
    console.log("═══════════════════════════════════════════════════════════════\n");

    const categories = Object.keys(categorized).sort();
    for (const category of categories) {
        const catMarkets = categorized[category];
        if (!catMarkets) continue;
        const count = catMarkets.length;
        const percent = ((count / allMarkets.length) * 100).toFixed(1);
        const bar = '█'.repeat(Math.floor(parseFloat(percent) / 2));
        console.log(`   ${category.padEnd(15)} ${count.toString().padStart(4)} (${percent.padStart(5)}%) ${bar}`);
    }
    console.log();

    // Фильтр по категории
    let marketsToShow: EnrichedMarket[] = categoryFilter
        ? (categorized[categoryFilter] || [])
        : allMarkets;

    if (limit > 0) {
        marketsToShow = marketsToShow.slice(0, limit);
    }

    // Показываем рынки
    if (categoryFilter || limit > 0) {
        console.log("═══════════════════════════════════════════════════════════════");
        console.log(`📋 РЫНКИ ${categoryFilter ? `(${categoryFilter.toUpperCase()})` : ''} ${limit > 0 ? `[limit: ${limit}]` : ''}`);
        console.log("═══════════════════════════════════════════════════════════════\n");

        for (let i = 0; i < marketsToShow.length; i++) {
            const market = marketsToShow[i];
            if (!market) continue;

            const agent = registry.getAgentForMarket(market);
            const category = agent?.getCategory() || 'uncategorized';
            const yesToken = market.tokens?.find(t => t.outcome === 'Yes');
            const price = yesToken ? (yesToken.price * 100).toFixed(1) : 'N/A';

            const question = market.question.length > 70
                ? market.question.substring(0, 70) + '...'
                : market.question;

            console.log(`${(i + 1).toString().padStart(3)}. [${category.padEnd(12)}] ${price.padStart(5)}% | ${question}`);
        }
        console.log();
    }

    // Глубокий анализ (с Tavily)
    if (doAnalysis && marketsToShow.length > 0) {
        console.log("═══════════════════════════════════════════════════════════════");
        console.log("🔍 ГЛУБОКИЙ АНАЛИЗ (с Tavily)");
        console.log("═══════════════════════════════════════════════════════════════\n");

        const analysisLimit = Math.min(marketsToShow.length, 5); // Максимум 5 для экономии
        console.log(`   Анализируем ${analysisLimit} рынков (для экономии токенов)\n`);

        for (let i = 0; i < analysisLimit; i++) {
            const market = marketsToShow[i];
            if (!market) continue;

            const agent = registry.getAgentForMarket(market);

            if (!agent) {
                console.log(`${i + 1}. ${market.question.substring(0, 50)}...`);
                console.log(`   → Нет подходящего агента\n`);
                continue;
            }

            console.log(`${i + 1}. ${market.question.substring(0, 60)}...`);

            try {
                const recommendation = await agent.analyzeWithCache(market);
                if (recommendation) {
                    const edge = recommendation.edge
                        ? `${(recommendation.edge * 100).toFixed(2)}%`
                        : 'N/A';
                    console.log(`   → ${recommendation.action} | Confidence: ${(recommendation.confidence * 100).toFixed(0)}% | Edge: ${edge}`);
                    console.log(`   → ${recommendation.reasoning.substring(0, 80)}...`);
                }
            } catch {
                console.log(`   → Ошибка анализа`);
            }
            console.log();
        }
    }

    // Примеры uncategorized
    const uncategorizedMarkets = categorized['uncategorized'];
    if (uncategorizedMarkets && uncategorizedMarkets.length > 0) {
        console.log("═══════════════════════════════════════════════════════════════");
        console.log("❓ ПРИМЕРЫ НЕКАТЕГОРИЗИРОВАННЫХ РЫНКОВ (первые 10)");
        console.log("═══════════════════════════════════════════════════════════════\n");

        const examples = uncategorizedMarkets.slice(0, 10);
        for (const market of examples) {
            console.log(`   • ${market.question.substring(0, 70)}...`);
        }
        console.log();
    }

    // Cleanup
    await registry.destroy();

    console.log("✅ Анализ завершен\n");
}

// Запуск
analyzeMarkets().catch(error => {
    console.error("❌ Ошибка:", error);
    process.exit(1);
});
