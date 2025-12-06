/**
 * Тест AI Market Scorer
 * Демонстрация использования AI для оценки рынков
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { ClobClient } from '@polymarket/clob-client';
import { AIMarketScorer } from '../services/ai/ai-market-scorer.js';
// import type { Market } from '../types/market.js'; // Не используется

dotenvConfig({ path: resolve(__dirname, '../../.env') });

async function testAIScorer() {
    console.warn('🧪 Testing AI Market Scorer\n');

    // 1. Инициализация клиента
    const host = process.env.CLOB_API_URL || 'https://clob.polymarket.com';
    const chainId = parseInt(process.env.CHAIN_ID || '137');
    const client = new ClobClient(host, chainId);

    console.warn('📡 Connected to Polymarket API\n');

    // 2. Получаем рынки
    console.warn('📊 Fetching markets...');
    const response = await client.getSamplingMarkets();
    const markets = response.data || [];
    console.warn(`✅ Found ${markets.length} markets\n`);

    // 3. Фильтруем активные рынки
    const activeMarkets = markets
        .filter(m => m.active && !m.closed && m.accepting_orders)
        .slice(0, 5); // Берем первые 5 для теста

    console.warn(`🎯 Testing with ${activeMarkets.length} active markets\n`);

    // 4. Инициализация AI Scorer
    const scorer = new AIMarketScorer();
    console.warn('🤖 AI Market Scorer initialized\n');

    // 5. Тестируем scoring для одного рынка
    console.warn('='.repeat(80));
    console.warn('TEST 1: Single Market Scoring');
    console.warn('='.repeat(80));
    
    const testMarket = activeMarkets[0];
    if (testMarket) {
        console.warn(`\n📋 Market: ${testMarket.question}`);
        console.warn(`   Condition ID: ${testMarket.condition_id}`);
        
        const score = await scorer.scoreMarket(testMarket, {
            strategyType: 'endgame',
            riskTolerance: 'medium'
        });

        console.warn(`\n✅ AI Score: ${(score.score * 100).toFixed(1)}%`);
        console.warn(`   Confidence: ${(score.confidence * 100).toFixed(1)}%`);
        console.warn(`   Reasoning: ${score.reasoning}`);
        
        if (score.riskFactors.length > 0) {
            console.warn(`   ⚠️  Risk Factors:`);
            score.riskFactors.forEach(factor => {
                console.warn(`      - ${factor}`);
            });
        }
        
        if (score.opportunities.length > 0) {
            console.warn(`   💡 Opportunities:`);
            score.opportunities.forEach(opp => {
                console.warn(`      - ${opp}`);
            });
        }
    }

    // 6. Тестируем batch scoring
    console.warn('\n' + '='.repeat(80));
    console.warn('TEST 2: Batch Scoring (Top Markets)');
    console.warn('='.repeat(80));

    const scoredMarkets = await scorer.scoreMarkets(activeMarkets, {
        strategyType: 'endgame',
        riskTolerance: 'high'
    });

    console.warn('\n📊 Top Markets by AI Score:\n');
    scoredMarkets.forEach((item, index) => {
        const { market, score } = item;
        console.warn(`${index + 1}. ${market.question.substring(0, 60)}...`);
        console.warn(`   Score: ${(score.score * 100).toFixed(1)}% | Confidence: ${(score.confidence * 100).toFixed(1)}%`);
        
        const yesToken = market.tokens.find(t => t.outcome === 'Yes');
        if (yesToken) {
            console.warn(`   YES Price: ${(yesToken.price * 100).toFixed(2)}%`);
        }
        console.warn();
    });

    // 7. Пример фильтрации по AI score
    console.warn('='.repeat(80));
    console.warn('TEST 3: Filtering Markets by AI Score');
    console.warn('='.repeat(80));

    const minScore = 0.7;
    const highScoreMarkets = scoredMarkets
        .filter(item => item.score.score >= minScore)
        .map(item => item.market);

    console.warn(`\n✅ Markets with AI Score >= ${minScore * 100}%: ${highScoreMarkets.length}`);
    highScoreMarkets.forEach((market, index) => {
        const score = scoredMarkets.find(s => s.market.condition_id === market.condition_id)?.score;
        console.warn(`   ${index + 1}. ${market.question.substring(0, 50)}... (Score: ${(score?.score || 0) * 100}%)`);
    });

    console.warn('\n✅ AI Scorer test completed!\n');
}

// Запуск теста
testAIScorer().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});

