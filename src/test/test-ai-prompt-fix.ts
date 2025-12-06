/**
 * Тест исправления AI промпта для recommendedAction
 * Проверяет что AI теперь правильно понимает логику BUY_YES vs BUY_NO
 */

import { AIMarketFilter } from '../services/ai/ai-market-filter';
import type { Market } from '../types/market';

async function testAIPromptFix() {
    console.warn('🧪 Тест исправления AI промпта для recommendedAction\n');

    // Создаем тестовый рынок "Taylor Swift Edition"
    const testMarket: Market = {
        condition_id: 'test-123',
        question: 'Nothing Ever Happens: Taylor Swift Edition - Will Taylor Swift marry Travis Kelce, become pregnant, or mention him in her new album by December 31, 2025?',
        description: 'Market resolves to NO if any of these events occur. YES if none occur.',
        market_slug: 'taylor-swift-test',
        end_date_iso: '2025-12-31T23:59:59Z',
        active: true,
        closed: false,
        archived: false,
        accepting_orders: true,
        minimum_order_size: 1,
        minimum_tick_size: 0.01,
        neg_risk: false,
        tokens: [
            {
                token_id: 'yes-token',
                outcome: 'Yes',
                price: 0.93,  // 93% рынок думает что ничего НЕ случится
                winner: false
            },
            {
                token_id: 'no-token',
                outcome: 'No',
                price: 0.07,  // 7% рынок думает что что-то случится
                winner: false
            }
        ]
    };

    const yesToken = testMarket.tokens.find(t => t.outcome === 'Yes');
    const noToken = testMarket.tokens.find(t => t.outcome === 'No');

    console.warn('📊 Тестовый рынок:');
    console.warn(`   Вопрос: ${testMarket.question.substring(0, 80)}...`);
    console.warn(`   Market Price: YES ${((yesToken?.price || 0.93) * 100).toFixed(0)}% (ничего не случится)`);
    console.warn(`   Market Price: NO ${((noToken?.price || 0.07) * 100).toFixed(0)}% (что-то случится)\n`);

    // Инициализируем AI фильтр с новостями
    const filter = new AIMarketFilter(true);

    try {
        console.warn('🤖 Запуск AI анализа...\n');

        const analysis = await filter.analyzeMarket(testMarket, {
            strategyType: 'high-confidence',
            minAttractiveness: 0.65,
            maxRisk: 'medium'
        });

        console.warn('✅ AI анализ завершен\n');
        console.warn('📋 Результаты:');
        console.warn(`   Should Trade: ${analysis.shouldTrade ? '✅ YES' : '❌ NO'}`);
        console.warn(`   Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
        console.warn(`   Attractiveness: ${(analysis.attractiveness * 100).toFixed(1)}%`);
        console.warn(`   Risk Level: ${analysis.riskLevel.toUpperCase()}`);

        if (analysis.estimatedProbability !== undefined && yesToken) {
            const marketPrice = yesToken.price;
            const edge = Math.abs(analysis.estimatedProbability - marketPrice);

            console.warn(`\n📊 Probability Analysis:`);
            console.warn(`   AI Estimate (YES): ${(analysis.estimatedProbability * 100).toFixed(1)}%`);
            console.warn(`   Market Price (YES): ${(marketPrice * 100).toFixed(1)}%`);
            console.warn(`   Edge: ${(edge * 100).toFixed(1)} п.п.`);
            console.warn(`   Recommended Action: ${analysis.recommendedAction || 'NONE'}`);

            // Проверка логики
            console.warn(`\n🔍 Проверка логической последовательности:`);

            if (analysis.recommendedAction === 'BUY_YES') {
                if (analysis.estimatedProbability > marketPrice) {
                    console.warn(`   ✅ BUY_YES логичен: AI estimate (${(analysis.estimatedProbability * 100).toFixed(1)}%) > Market (${(marketPrice * 100).toFixed(1)}%)`);
                } else {
                    console.warn(`   ❌ BUY_YES ОШИБКА: AI estimate (${(analysis.estimatedProbability * 100).toFixed(1)}%) <= Market (${(marketPrice * 100).toFixed(1)}%)`);
                    console.warn(`   ⚠️  ДОЛЖНО БЫТЬ BUY_NO!`);
                }
            } else if (analysis.recommendedAction === 'BUY_NO') {
                if (analysis.estimatedProbability < marketPrice) {
                    console.warn(`   ✅ BUY_NO логичен: AI estimate (${(analysis.estimatedProbability * 100).toFixed(1)}%) < Market (${(marketPrice * 100).toFixed(1)}%)`);
                } else {
                    console.warn(`   ❌ BUY_NO ОШИБКА: AI estimate (${(analysis.estimatedProbability * 100).toFixed(1)}%) >= Market (${(marketPrice * 100).toFixed(1)}%)`);
                    console.warn(`   ⚠️  ДОЛЖНО БЫТЬ BUY_YES!`);
                }
            } else {
                console.warn(`   ℹ️  Action: ${analysis.recommendedAction || 'NONE'} - пропускаем проверку`);
            }

        } else {
            console.warn(`\n   ⚠️  estimatedProbability отсутствует!`);
        }

        console.warn(`\n💭 Reasoning:`);
        console.warn(`   ${analysis.reasoning.substring(0, 200)}...\n`);

        // Финальный вердикт
        const hasError = yesToken && (
            (analysis.recommendedAction === 'BUY_YES' && analysis.estimatedProbability !== undefined && analysis.estimatedProbability <= yesToken.price) ||
            (analysis.recommendedAction === 'BUY_NO' && analysis.estimatedProbability !== undefined && analysis.estimatedProbability >= yesToken.price)
        );

        if (hasError) {
            console.warn('❌ ТЕСТ ПРОВАЛЕН: AI все еще делает логические ошибки в recommendedAction\n');
            process.exit(1);
        } else {
            console.warn('✅ ТЕСТ ПРОЙДЕН: AI правильно определяет recommendedAction!\n');
            process.exit(0);
        }

    } catch (error) {
        console.error('❌ Ошибка теста:', error);
        process.exit(1);
    }
}

// Запуск теста
testAIPromptFix();
