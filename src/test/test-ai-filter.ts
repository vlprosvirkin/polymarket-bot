/**
 * Тест AI Market Filter - похоже на подход Poly-Trader
 * Демонстрация использования AI для выбора рынков для торговли
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { ClobClient } from '@polymarket/clob-client';
import { AIMarketFilter } from '../services/ai/ai-market-filter.js';
import type { Market } from '../types/market.js';

dotenvConfig({ path: resolve(__dirname, '../../.env') });

async function testAIMarketFilter() {
    console.log('🧪 Testing AI Market Filter (Poly-Trader approach)\n');

    // 1. Инициализация клиента
    const host = process.env.CLOB_API_URL || 'https://clob.polymarket.com';
    const chainId = parseInt(process.env.CHAIN_ID || '137');
    const client = new ClobClient(host, chainId);

    console.log('📡 Connected to Polymarket API\n');

    // 2. Получаем рынки
    console.log('📊 Fetching markets...');
    const response = await client.getSamplingMarkets();
    const markets = response.data || [];
    console.log(`✅ Found ${markets.length} markets\n`);

    // 3. Фильтруем активные рынки
    const activeMarkets = markets
        .filter(m => m.active && !m.closed && m.accepting_orders)
        .slice(0, 10); // Берем первые 10 для теста

    console.log(`🎯 Testing with ${activeMarkets.length} active markets\n`);

    // 4. Инициализация AI Market Filter
    const filter = new AIMarketFilter();
    console.log('🤖 AI Market Filter initialized\n');

    // 5. Тестируем анализ одного рынка
    console.log('='.repeat(80));
    console.log('TEST 1: Single Market Analysis');
    console.log('='.repeat(80));

    const testMarket = activeMarkets[0];
    if (testMarket) {
        console.log(`\n📋 Market: ${testMarket.question}`);
        console.log(`   Condition ID: ${testMarket.condition_id}`);

        const analysis = await filter.analyzeMarket(testMarket, {
            strategyType: 'endgame',
            minAttractiveness: 0.6,
            maxRisk: 'medium'
        });

        console.log(`\n✅ AI Analysis:`);
        console.log(`   Should Trade: ${analysis.shouldTrade ? '✅ YES' : '❌ NO'}`);
        console.log(`   Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
        console.log(`   Attractiveness: ${(analysis.attractiveness * 100).toFixed(1)}%`);
        console.log(`   Risk Level: ${analysis.riskLevel.toUpperCase()}`);
        console.log(`   Reasoning: ${analysis.reasoning}`);

        if (analysis.riskFactors.length > 0) {
            console.log(`\n   ⚠️  Risk Factors:`);
            analysis.riskFactors.forEach(factor => {
                console.log(`      - ${factor}`);
            });
        }

        if (analysis.opportunities.length > 0) {
            console.log(`\n   💡 Opportunities:`);
            analysis.opportunities.forEach(opp => {
                console.log(`      - ${opp}`);
            });
        }

        if (analysis.recommendedAction) {
            console.log(`\n   🎯 Recommended Action: ${analysis.recommendedAction}`);
        }
    }

    // 6. Тестируем фильтрацию нескольких рынков
    console.log('\n' + '='.repeat(80));
    console.log('TEST 2: Filter Multiple Markets (Poly-Trader Style)');
    console.log('='.repeat(80));

    const filterContext = {
        strategyType: 'endgame' as const,
        minAttractiveness: 0.6,
        maxRisk: 'medium' as const,
        excludedCategories: [] // Можно исключить категории
    };

    const selectedMarkets = await filter.filterMarkets(activeMarkets, filterContext);

    console.log(`\n✅ AI Selected ${selectedMarkets.length} markets for trading:\n`);

    selectedMarkets.forEach((item, index) => {
        const { market, analysis } = item;
        console.log(`${index + 1}. ${market.question.substring(0, 60)}...`);
        console.log(`   Should Trade: ${analysis.shouldTrade ? '✅' : '❌'}`);
        console.log(`   Attractiveness: ${(analysis.attractiveness * 100).toFixed(1)}%`);
        console.log(`   Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
        console.log(`   Risk: ${analysis.riskLevel.toUpperCase()}`);
        
        const yesToken = market.tokens.find(t => t.outcome === 'Yes');
        if (yesToken) {
            console.log(`   YES Price: ${(yesToken.price * 100).toFixed(2)}%`);
        }
        
        if (analysis.recommendedAction) {
            console.log(`   Action: ${analysis.recommendedAction}`);
        }
        console.log();
    });

    // 7. Статистика
    console.log('='.repeat(80));
    console.log('TEST 3: Statistics');
    console.log('='.repeat(80));

    const total = activeMarkets.length;
    const tradable = selectedMarkets.length;
    const avgAttractiveness = selectedMarkets.length > 0
        ? selectedMarkets.reduce((sum, item) => sum + item.analysis.attractiveness, 0) / selectedMarkets.length
        : 0;
    const avgConfidence = selectedMarkets.length > 0
        ? selectedMarkets.reduce((sum, item) => sum + item.analysis.confidence, 0) / selectedMarkets.length
        : 0;

    const riskDistribution = selectedMarkets.reduce((acc, item) => {
        acc[item.analysis.riskLevel] = (acc[item.analysis.riskLevel] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    console.log(`\n📊 Statistics:`);
    console.log(`   Total Markets Analyzed: ${total}`);
    console.log(`   Markets Selected for Trading: ${tradable} (${(tradable / total * 100).toFixed(1)}%)`);
    console.log(`   Average Attractiveness: ${(avgAttractiveness * 100).toFixed(1)}%`);
    console.log(`   Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    console.log(`\n   Risk Distribution:`);
    Object.entries(riskDistribution).forEach(([risk, count]) => {
        console.log(`      ${risk.toUpperCase()}: ${count}`);
    });

    // 8. Пример использования в стратегии
    console.log('\n' + '='.repeat(80));
    console.log('TEST 4: Integration Example');
    console.log('='.repeat(80));

    console.log(`\n💡 How to use in your strategy:\n`);
    console.log(`// 1. Get all markets`);
    console.log(`const allMarkets = await client.getSamplingMarkets();`);
    console.log(`\n// 2. Basic filtering (your existing rules)`);
    console.log(`const basicFiltered = allMarkets.filter(m => m.active && !m.closed);`);
    console.log(`\n// 3. AI Filter (new - like Poly-Trader)`);
    console.log(`const aiFilter = new AIMarketFilter();`);
    console.log(`const aiSelected = await aiFilter.filterMarkets(basicFiltered, {`);
    console.log(`    strategyType: 'endgame',`);
    console.log(`    minAttractiveness: 0.6,`);
    console.log(`    maxRisk: 'medium'`);
    console.log(`});`);
    console.log(`\n// 4. Use selected markets`);
    console.log(`const marketsToTrade = aiSelected.map(item => item.market);`);

    console.log('\n✅ AI Market Filter test completed!\n');
}

// Запуск теста
testAIMarketFilter().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});

