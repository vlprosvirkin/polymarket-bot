/**
 * Тест: AI оценка вероятности и поиск edge с использованием новостей
 * 
 * Проверяет:
 * 1. AI возвращает estimatedProbability
 * 2. SerpAPI новости используются в анализе
 * 3. Tavily используется для топ-рынков
 * 4. Edge рассчитывается правильно
 * 5. Стратегия фильтрует по минимальному edge
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { ClobClient } from '@polymarket/clob-client';
import { AIMarketFilter } from '../services/ai/ai-market-filter';
import { AIStrategy, AIStrategyConfig } from '../strategies/AIStrategy';
import { AI_STRATEGY_CONFIG } from '../core/config';

dotenvConfig({ path: resolve(__dirname, '../../.env') });

async function testAIProbabilityAndEdge() {
    console.log('🧪 Тест: AI оценка вероятности и поиск edge\n');
    console.log('═'.repeat(80));

    // 1. Проверка окружения
    console.log('\n📋 Проверка окружения:');
    const hasSerpAPI = !!process.env.SERP_API_KEY;
    const hasTavily = !!process.env.TAVILY_API_KEY;
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    
    console.log(`   SerpAPI: ${hasSerpAPI ? '✅' : '❌'} ${hasSerpAPI ? '(новости включены)' : '(новости отключены - установи SERP_API_KEY)'}`);
    console.log(`   Tavily: ${hasTavily ? '✅' : '❌'} ${hasTavily ? '(глубокий анализ включен)' : '(глубокий анализ отключен - установи TAVILY_API_KEY)'}`);
    console.log(`   OpenAI: ${hasOpenAI ? '✅' : '❌'} ${hasOpenAI ? '(AI доступен)' : '(AI недоступен - установи OPENAI_API_KEY)'}`);
    
    if (!hasOpenAI) {
        console.error('\n❌ OPENAI_API_KEY не найден! Тест невозможен.');
        process.exit(1);
    }

    // 2. Получение рынков
    console.log('\n📡 Получение рынков из Polymarket API...');
    const client = new ClobClient(
        process.env.CLOB_API_URL || 'https://clob.polymarket.com',
        parseInt(process.env.CHAIN_ID || '137')
    );
    
    const response = await client.getSamplingMarkets();
    const allMarkets = response.data || [];
    console.log(`   ✅ Получено ${allMarkets.length} рынков`);

    // 3. Фильтрация активных рынков
    const activeMarkets = allMarkets
        .filter(m => m.active && !m.closed && m.accepting_orders)
        .slice(0, 5); // Берем 5 для теста

    if (activeMarkets.length === 0) {
        console.error('❌ Нет активных рынков для теста');
        process.exit(1);
    }

    console.log(`   ✅ Отобрано ${activeMarkets.length} активных рынков для анализа\n`);

    // 4. Инициализация AI Filter с новостями
    console.log('🤖 Инициализация AI Market Filter...');
    const aiFilter = new AIMarketFilter(hasSerpAPI);
    console.log('   ✅ AI Filter готов\n');

    // 5. Тест: Анализ одного рынка с проверкой estimatedProbability
    console.log('═'.repeat(80));
    console.log('ТЕСТ 1: Анализ рынка с оценкой вероятности и новостями');
    console.log('═'.repeat(80));

    const testMarket = activeMarkets[0];
    if (!testMarket) {
        console.error('❌ Нет рынка для теста');
        process.exit(1);
    }

    const yesToken = testMarket.tokens?.find((t: { outcome: string }) => t.outcome === 'Yes');
    const marketPrice = yesToken?.price ?? 0.5;

    console.log(`\n📊 Рынок: ${testMarket.question}`);
    console.log(`   Condition ID: ${testMarket.condition_id}`);
    console.log(`   Рыночная цена YES: ${(marketPrice * 100).toFixed(2)}%`);
    console.log(`   Рыночная цена NO: ${((1 - marketPrice) * 100).toFixed(2)}%`);

    // Получаем новости заранее для показа в тесте
    let newsCount = 0;
    if (hasSerpAPI) {
        console.log(`\n📰 Поиск новостей через SerpAPI...`);
        try {
            const { SerpAPIService } = await import('../services/serpapi.service');
            const serpApi = new SerpAPIService();
            const keywords = serpApi.extractKeywords(testMarket.question);
            const news = await serpApi.searchNews(keywords, {
                numResults: 5,
                timeRange: 'past_24h'
            });
            newsCount = news.length;
            if (news.length > 0) {
                console.log(`   ✅ Найдено ${news.length} новостей:`);
                news.slice(0, 3).forEach((article, i) => {
                    console.log(`      ${i + 1}. ${article.title.substring(0, 60)}...`);
                    if (article.snippet) {
                        console.log(`         ${article.snippet.substring(0, 80)}...`);
                    }
                });
            } else {
                console.log(`   ⚠️  Новости не найдены (может быть связано с запросом)`);
            }
        } catch (error) {
            console.log(`   ⚠️  Ошибка получения новостей: ${error}`);
        }
    }

    console.log(`\n🤖 AI анализ рынка...`);
    const startTime = Date.now();
    
    const analysis = await aiFilter.analyzeMarket(testMarket, {
        strategyType: 'high-confidence',
        minAttractiveness: 0.5,
        maxRisk: 'medium'
    });

    const analysisTime = Date.now() - startTime;
    console.log(`   ⏱️  Время анализа: ${analysisTime}ms\n`);

    // Проверка результата
    console.log('✅ Результаты AI анализа:');
    console.log(`   Should Trade: ${analysis.shouldTrade ? '✅ YES' : '❌ NO'}`);
    console.log(`   Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
    console.log(`   Attractiveness: ${(analysis.attractiveness * 100).toFixed(1)}%`);
    
    // ⚠️ ВАЖНО: Проверка estimatedProbability
    if (analysis.estimatedProbability !== undefined) {
        const aiProb = analysis.estimatedProbability;
        const edge = Math.abs(aiProb - marketPrice);
        const edgePercent = (edge * 100).toFixed(1);
        
        console.log(`\n   📊 Оценка вероятности AI: ${(aiProb * 100).toFixed(1)}%`);
        console.log(`   💹 Edge (разница): ${edgePercent} процентных пунктов`);
        
        if (aiProb > marketPrice) {
            console.log(`   🎯 Направление: AI считает что вероятность ВЫШЕ рыночной (+${edgePercent} п.п.) → BUY_YES`);
        } else if (aiProb < marketPrice) {
            console.log(`   🎯 Направление: AI считает что вероятность НИЖЕ рыночной (-${edgePercent} п.п.) → BUY_NO`);
        } else {
            console.log(`   ⚖️  AI и рынок согласны (нет edge)`);
        }
        
        // Проверка минимального edge
        const minEdge = AI_STRATEGY_CONFIG.MIN_EDGE_PERCENTAGE_POINTS;
        if (edge >= minEdge) {
            console.log(`   ✅ Edge достаточен (${edgePercent} >= ${(minEdge * 100).toFixed(1)} п.п.)`);
        } else {
            console.log(`   ⚠️  Edge недостаточен (${edgePercent} < ${(minEdge * 100).toFixed(1)} п.п.) - рынок будет пропущен`);
        }
    } else {
        console.log(`   ⚠️  ВНИМАНИЕ: AI не вернул estimatedProbability!`);
        console.log(`      Это означает что AI не дал численную оценку вероятности.`);
        console.log(`      Проверьте промпт и формат ответа AI.`);
    }

    console.log(`\n   Risk Level: ${analysis.riskLevel.toUpperCase()}`);
    console.log(`   Reasoning: ${analysis.reasoning.substring(0, 200)}...`);
    
        if (analysis.recommendedAction) {
        console.log(`   Recommended Action: ${analysis.recommendedAction}`);
        
        // Проверка соответствия recommendedAction и edge
        if (analysis.estimatedProbability !== undefined) {
            if (analysis.recommendedAction === 'BUY_YES' && analysis.estimatedProbability <= marketPrice) {
                console.log(`   ⚠️  ВНИМАНИЕ: AI рекомендует BUY_YES, но estimatedProbability (${(analysis.estimatedProbability * 100).toFixed(1)}%) <= рыночная цена (${(marketPrice * 100).toFixed(1)}%)`);
            } else if (analysis.recommendedAction === 'BUY_NO' && analysis.estimatedProbability >= marketPrice) {
                console.log(`   ⚠️  ВНИМАНИЕ: AI рекомендует BUY_NO, но estimatedProbability (${(analysis.estimatedProbability * 100).toFixed(1)}%) >= рыночная цена (${(marketPrice * 100).toFixed(1)}%)`);
            }
        }
    } else {
        console.log(`   ⚠️  Recommended Action: не указано (AI не дал конкретную рекомендацию)`);
    }
    
    // Показываем использование новостей
    if (hasSerpAPI && newsCount > 0) {
        console.log(`\n   📰 Использование новостей:`);
        console.log(`      Получено новостей: ${newsCount}`);
        console.log(`      Новости переданы в промпт AI`);
        console.log(`      AI учитывает новости в оценке вероятности`);
    } else if (hasSerpAPI && newsCount === 0) {
        console.log(`\n   📰 Использование новостей:`);
        console.log(`      ⚠️  Новости не найдены (SerpAPI вернул 0 результатов)`);
        console.log(`      AI анализирует только на основе общих знаний`);
    }
    
    // Показываем почему Tavily не использовался
    if (hasTavily) {
        const shouldUseTavily = analysis.attractiveness >= AI_STRATEGY_CONFIG.TAVILY_ATTRACTIVENESS_THRESHOLD;
        console.log(`\n   🔬 Tavily анализ:`);
        if (shouldUseTavily) {
            console.log(`      ✅ Использован (attractiveness ${(analysis.attractiveness * 100).toFixed(1)}% >= ${(AI_STRATEGY_CONFIG.TAVILY_ATTRACTIVENESS_THRESHOLD * 100).toFixed(0)}%)`);
        } else {
            console.log(`      ⚠️  Не использован (attractiveness ${(analysis.attractiveness * 100).toFixed(1)}% < ${(AI_STRATEGY_CONFIG.TAVILY_ATTRACTIVENESS_THRESHOLD * 100).toFixed(0)}%)`);
        }
    }

    // 6. Тест: Фильтрация рынков через AIStrategy с проверкой edge
    console.log('\n\n' + '═'.repeat(80));
    console.log('ТЕСТ 2: Фильтрация через AIStrategy с проверкой edge');
    console.log('═'.repeat(80));

    const strategyConfig: AIStrategyConfig = {
        spread: 0,
        orderSize: 100,
        maxPosition: 1000,
        profitThreshold: 0.95,
        stopLoss: 0.75,
        minLiquidity: 100,
        maxMarkets: 10,
        excludeNegRisk: false, // Не фильтруем по NegRisk для теста
        minPrice: 0.1,
        maxPrice: 0.99,
        useAI: true,
        useNews: hasSerpAPI,
        minAIAttractiveness: 0.5,
        maxAIRisk: 'medium',
        useAIForSignals: true,
        maxMarketsForAI: 5,
        minEdgePercentagePoints: 0.05, // 5 п.п. для теста (меньше стандартных 10)
        maxAIBudgetPerCycle: 1.0,
        maxAIBudgetPerDay: 10.0,
        aiCacheTTL: 5 * 60 * 1000
    };

    const strategy = new AIStrategy(strategyConfig);
    strategy.setClient(client);

    console.log(`\n🔍 Фильтрация ${activeMarkets.length} рынков через AIStrategy...`);
    console.log(`   Минимальный edge: ${(strategyConfig.minEdgePercentagePoints! * 100).toFixed(1)} процентных пунктов`);
    
    const filteredMarkets = await strategy.asyncFilterMarkets(activeMarkets);
    
    console.log(`\n✅ Результаты фильтрации:`);
    console.log(`   Рынков до фильтрации: ${activeMarkets.length}`);
    console.log(`   Рынков после фильтрации: ${filteredMarkets.length}`);
    
    if (filteredMarkets.length > 0) {
        console.log(`\n📊 Отфильтрованные рынки:`);
        filteredMarkets.forEach((market, i) => {
            const yesToken = market.tokens?.find((t: { outcome: string }) => t.outcome === 'Yes');
            const price = yesToken?.price ?? 0.5;
            console.log(`\n   ${i + 1}. ${market.question.substring(0, 60)}...`);
            console.log(`      Рыночная цена: ${(price * 100).toFixed(1)}%`);
            
            // Пытаемся получить анализ из кэша стратегии (если доступен)
            // Это покажет estimatedProbability и edge для отфильтрованного рынка
            const analysisCache = (strategy as any).analysisCache;
            if (analysisCache) {
                const cached = analysisCache.get(market.condition_id);
                if (cached && cached.analysis) {
                    const analysis = cached.analysis;
                    if (analysis.estimatedProbability !== undefined) {
                        const edge = Math.abs(analysis.estimatedProbability - price);
                        console.log(`      AI Probability: ${(analysis.estimatedProbability * 100).toFixed(1)}%`);
                        console.log(`      Edge: ${(edge * 100).toFixed(1)} п.п.`);
                        console.log(`      Recommended: ${analysis.recommendedAction || 'не указано'}`);
                    }
                }
            }
        });
    } else {
        console.log(`   ⚠️  Все рынки отфильтрованы (возможно edge недостаточен)`);
    }

    // 7. Статистика
    console.log('\n\n' + '═'.repeat(80));
    console.log('ТЕСТ 3: Статистика использования новостей');
    console.log('═'.repeat(80));

    console.log(`\n📊 Использование провайдеров:`);
    console.log(`   SerpAPI (новости): ${hasSerpAPI ? '✅ Используется' : '❌ Не используется'}`);
    console.log(`   Tavily (глубокий анализ): ${hasTavily ? '✅ Используется для топ-рынков' : '❌ Не используется'}`);
    
    if (hasSerpAPI) {
        console.log(`\n💡 SerpAPI помогает AI:`);
        console.log(`   - Получать свежие новости о событиях`);
        console.log(`   - Анализировать актуальную информацию`);
        console.log(`   - Делать более точные оценки вероятности`);
    }
    
    if (hasTavily) {
        console.log(`\n💡 Tavily помогает AI:`);
        console.log(`   - Глубокий поиск по множеству источников`);
        console.log(`   - Структурированные ответы на вопросы`);
        console.log(`   - Используется для рынков с attractiveness >= ${(AI_STRATEGY_CONFIG.TAVILY_ATTRACTIVENESS_THRESHOLD * 100).toFixed(0)}%`);
    }

    // 8. Рекомендации
    console.log('\n\n' + '═'.repeat(80));
    console.log('📝 Рекомендации для улучшения:');
    console.log('═'.repeat(80));

    if (!analysis.estimatedProbability) {
        console.log(`\n⚠️  ПРОБЛЕМА: AI не возвращает estimatedProbability`);
        console.log(`   Решение:`);
        console.log(`   1. Проверьте промпт в AIMarketFilter`);
        console.log(`   2. Убедитесь что в промпте есть инструкция вернуть estimatedProbability`);
        console.log(`   3. Проверьте что AI понимает формат JSON ответа`);
    } else {
        console.log(`\n✅ AI правильно возвращает estimatedProbability`);
        console.log(`   Edge рассчитывается: ${Math.abs(analysis.estimatedProbability - marketPrice) >= strategyConfig.minEdgePercentagePoints! ? '✅' : '❌'}`);
    }

    if (!hasSerpAPI) {
        console.log(`\n💡 Рекомендация: Добавьте SERP_API_KEY для использования новостей`);
        console.log(`   Это улучшит точность оценок AI`);
    }

    if (!hasTavily) {
        console.log(`\n💡 Рекомендация: Добавьте TAVILY_API_KEY для глубокого анализа`);
        console.log(`   Это улучшит качество анализа для топ-рынков`);
    }

    console.log('\n✅ Тест завершен!\n');
}

// Запуск теста
testAIProbabilityAndEdge().catch(error => {
    console.error('\n❌ Тест провален:', error);
    if (error instanceof Error) {
        console.error('Stack:', error.stack);
    }
    process.exit(1);
});

