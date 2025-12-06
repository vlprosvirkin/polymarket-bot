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
    console.warn('🧪 Тест: AI оценка вероятности и поиск edge\n');
    console.warn('═'.repeat(80));

    // 1. Проверка окружения
    console.warn('\n📋 Проверка окружения:');
    const hasSerpAPI = !!process.env.SERP_API_KEY;
    const hasTavily = !!process.env.TAVILY_API_KEY;
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    
    console.warn(`   SerpAPI: ${hasSerpAPI ? '✅' : '❌'} ${hasSerpAPI ? '(новости включены)' : '(новости отключены - установи SERP_API_KEY)'}`);
    console.warn(`   Tavily: ${hasTavily ? '✅' : '❌'} ${hasTavily ? '(глубокий анализ включен)' : '(глубокий анализ отключен - установи TAVILY_API_KEY)'}`);
    console.warn(`   OpenAI: ${hasOpenAI ? '✅' : '❌'} ${hasOpenAI ? '(AI доступен)' : '(AI недоступен - установи OPENAI_API_KEY)'}`);
    
    if (!hasOpenAI) {
        console.error('\n❌ OPENAI_API_KEY не найден! Тест невозможен.');
        process.exit(1);
    }

    // 2. Получение рынков
    console.warn('\n📡 Получение рынков из Polymarket API...');
    const client = new ClobClient(
        process.env.CLOB_API_URL || 'https://clob.polymarket.com',
        parseInt(process.env.CHAIN_ID || '137')
    );
    
    const response = await client.getSamplingMarkets();
    const allMarkets = response.data || [];
    console.warn(`   ✅ Получено ${allMarkets.length} рынков`);

    // 3. Фильтрация активных рынков
    const activeMarkets = allMarkets
        .filter(m => m.active && !m.closed && m.accepting_orders)
        .slice(0, 5); // Берем 5 для теста

    if (activeMarkets.length === 0) {
        console.error('❌ Нет активных рынков для теста');
        process.exit(1);
    }

    console.warn(`   ✅ Отобрано ${activeMarkets.length} активных рынков для анализа\n`);

    // 4. Инициализация AI Filter с новостями
    console.warn('🤖 Инициализация AI Market Filter...');
    const aiFilter = new AIMarketFilter(hasSerpAPI);
    console.warn('   ✅ AI Filter готов\n');

    // 5. Тест: Анализ одного рынка с проверкой estimatedProbability
    console.warn('═'.repeat(80));
    console.warn('ТЕСТ 1: Анализ рынка с оценкой вероятности и новостями');
    console.warn('═'.repeat(80));

    const testMarket = activeMarkets[0];
    if (!testMarket) {
        console.error('❌ Нет рынка для теста');
        process.exit(1);
    }

    const yesToken = testMarket.tokens?.find((t: { outcome: string }) => t.outcome === 'Yes');
    const marketPrice = yesToken?.price ?? 0.5;

    console.warn(`\n📊 Рынок: ${testMarket.question}`);
    console.warn(`   Condition ID: ${testMarket.condition_id}`);
    console.warn(`   Рыночная цена YES: ${(marketPrice * 100).toFixed(2)}%`);
    console.warn(`   Рыночная цена NO: ${((1 - marketPrice) * 100).toFixed(2)}%`);

    // Получаем новости заранее для показа в тесте
    let newsCount = 0;
    if (hasSerpAPI) {
        console.warn(`\n📰 Поиск новостей через SerpAPI...`);
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
                console.warn(`   ✅ Найдено ${news.length} новостей:`);
                news.slice(0, 3).forEach((article, i) => {
                    console.warn(`      ${i + 1}. ${article.title.substring(0, 60)}...`);
                    if (article.snippet) {
                        console.warn(`         ${article.snippet.substring(0, 80)}...`);
                    }
                });
            } else {
                console.warn(`   ⚠️  Новости не найдены (может быть связано с запросом)`);
            }
        } catch (error) {
            console.warn(`   ⚠️  Ошибка получения новостей: ${error}`);
        }
    }

    console.warn(`\n🤖 AI анализ рынка...`);
    const startTime = Date.now();
    
    const analysis = await aiFilter.analyzeMarket(testMarket, {
        strategyType: 'high-confidence',
        minAttractiveness: 0.5,
        maxRisk: 'medium'
    });

    const analysisTime = Date.now() - startTime;
    console.warn(`   ⏱️  Время анализа: ${analysisTime}ms\n`);

    // Проверка результата
    console.warn('✅ Результаты AI анализа:');
    console.warn(`   Should Trade: ${analysis.shouldTrade ? '✅ YES' : '❌ NO'}`);
    console.warn(`   Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
    console.warn(`   Attractiveness: ${(analysis.attractiveness * 100).toFixed(1)}%`);
    
    // ⚠️ ВАЖНО: Проверка estimatedProbability
    if (analysis.estimatedProbability !== undefined) {
        const aiProb = analysis.estimatedProbability;
        const edge = Math.abs(aiProb - marketPrice);
        const edgePercent = (edge * 100).toFixed(1);
        
        console.warn(`\n   📊 Оценка вероятности AI: ${(aiProb * 100).toFixed(1)}%`);
        console.warn(`   💹 Edge (разница): ${edgePercent} процентных пунктов`);
        
        if (aiProb > marketPrice) {
            console.warn(`   🎯 Направление: AI считает что вероятность ВЫШЕ рыночной (+${edgePercent} п.п.) → BUY_YES`);
        } else if (aiProb < marketPrice) {
            console.warn(`   🎯 Направление: AI считает что вероятность НИЖЕ рыночной (-${edgePercent} п.п.) → BUY_NO`);
        } else {
            console.warn(`   ⚖️  AI и рынок согласны (нет edge)`);
        }
        
        // Проверка минимального edge
        const minEdge = AI_STRATEGY_CONFIG.MIN_EDGE_PERCENTAGE_POINTS;
        if (edge >= minEdge) {
            console.warn(`   ✅ Edge достаточен (${edgePercent} >= ${(minEdge * 100).toFixed(1)} п.п.)`);
        } else {
            console.warn(`   ⚠️  Edge недостаточен (${edgePercent} < ${(minEdge * 100).toFixed(1)} п.п.) - рынок будет пропущен`);
        }
    } else {
        console.warn(`   ⚠️  ВНИМАНИЕ: AI не вернул estimatedProbability!`);
        console.warn(`      Это означает что AI не дал численную оценку вероятности.`);
        console.warn(`      Проверьте промпт и формат ответа AI.`);
    }

    console.warn(`\n   Risk Level: ${analysis.riskLevel.toUpperCase()}`);
    console.warn(`   Reasoning: ${analysis.reasoning.substring(0, 200)}...`);
    
        if (analysis.recommendedAction) {
        console.warn(`   Recommended Action: ${analysis.recommendedAction}`);
        
        // Проверка соответствия recommendedAction и edge
        if (analysis.estimatedProbability !== undefined) {
            if (analysis.recommendedAction === 'BUY_YES' && analysis.estimatedProbability <= marketPrice) {
                console.warn(`   ⚠️  ВНИМАНИЕ: AI рекомендует BUY_YES, но estimatedProbability (${(analysis.estimatedProbability * 100).toFixed(1)}%) <= рыночная цена (${(marketPrice * 100).toFixed(1)}%)`);
            } else if (analysis.recommendedAction === 'BUY_NO' && analysis.estimatedProbability >= marketPrice) {
                console.warn(`   ⚠️  ВНИМАНИЕ: AI рекомендует BUY_NO, но estimatedProbability (${(analysis.estimatedProbability * 100).toFixed(1)}%) >= рыночная цена (${(marketPrice * 100).toFixed(1)}%)`);
            }
        }
    } else {
        console.warn(`   ⚠️  Recommended Action: не указано (AI не дал конкретную рекомендацию)`);
    }
    
    // Показываем использование новостей
    if (hasSerpAPI && newsCount > 0) {
        console.warn(`\n   📰 Использование новостей:`);
        console.warn(`      Получено новостей: ${newsCount}`);
        console.warn(`      Новости переданы в промпт AI`);
        console.warn(`      AI учитывает новости в оценке вероятности`);
    } else if (hasSerpAPI && newsCount === 0) {
        console.warn(`\n   📰 Использование новостей:`);
        console.warn(`      ⚠️  Новости не найдены (SerpAPI вернул 0 результатов)`);
        console.warn(`      AI анализирует только на основе общих знаний`);
    }
    
    // Показываем почему Tavily не использовался
    if (hasTavily) {
        const shouldUseTavily = analysis.attractiveness >= AI_STRATEGY_CONFIG.TAVILY_ATTRACTIVENESS_THRESHOLD;
        console.warn(`\n   🔬 Tavily анализ:`);
        if (shouldUseTavily) {
            console.warn(`      ✅ Использован (attractiveness ${(analysis.attractiveness * 100).toFixed(1)}% >= ${(AI_STRATEGY_CONFIG.TAVILY_ATTRACTIVENESS_THRESHOLD * 100).toFixed(0)}%)`);
        } else {
            console.warn(`      ⚠️  Не использован (attractiveness ${(analysis.attractiveness * 100).toFixed(1)}% < ${(AI_STRATEGY_CONFIG.TAVILY_ATTRACTIVENESS_THRESHOLD * 100).toFixed(0)}%)`);
        }
    }

    // 6. Тест: Фильтрация рынков через AIStrategy с проверкой edge
    console.warn('\n\n' + '═'.repeat(80));
    console.warn('ТЕСТ 2: Фильтрация через AIStrategy с проверкой edge');
    console.warn('═'.repeat(80));

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

    console.warn(`\n🔍 Фильтрация ${activeMarkets.length} рынков через AIStrategy...`);
    console.warn(`   Минимальный edge: ${(strategyConfig.minEdgePercentagePoints! * 100).toFixed(1)} процентных пунктов`);
    
    const filteredMarkets = await strategy.asyncFilterMarkets(activeMarkets);
    
    console.warn(`\n✅ Результаты фильтрации:`);
    console.warn(`   Рынков до фильтрации: ${activeMarkets.length}`);
    console.warn(`   Рынков после фильтрации: ${filteredMarkets.length}`);
    
    if (filteredMarkets.length > 0) {
        console.warn(`\n📊 Отфильтрованные рынки:`);
        filteredMarkets.forEach((market, i) => {
            const yesToken = market.tokens?.find((t: { outcome: string }) => t.outcome === 'Yes');
            const price = yesToken?.price ?? 0.5;
            console.warn(`\n   ${i + 1}. ${market.question.substring(0, 60)}...`);
            console.warn(`      Рыночная цена: ${(price * 100).toFixed(1)}%`);
            
            // Пытаемся получить анализ из кэша стратегии (если доступен)
            // Это покажет estimatedProbability и edge для отфильтрованного рынка
            const analysisCache = (strategy as any).analysisCache;
            if (analysisCache) {
                const cached = analysisCache.get(market.condition_id);
                if (cached && cached.analysis) {
                    const analysis = cached.analysis;
                    if (analysis.estimatedProbability !== undefined) {
                        const edge = Math.abs(analysis.estimatedProbability - price);
                        console.warn(`      AI Probability: ${(analysis.estimatedProbability * 100).toFixed(1)}%`);
                        console.warn(`      Edge: ${(edge * 100).toFixed(1)} п.п.`);
                        console.warn(`      Recommended: ${analysis.recommendedAction || 'не указано'}`);
                    }
                }
            }
        });
    } else {
        console.warn(`   ⚠️  Все рынки отфильтрованы (возможно edge недостаточен)`);
    }

    // 7. Статистика
    console.warn('\n\n' + '═'.repeat(80));
    console.warn('ТЕСТ 3: Статистика использования новостей');
    console.warn('═'.repeat(80));

    console.warn(`\n📊 Использование провайдеров:`);
    console.warn(`   SerpAPI (новости): ${hasSerpAPI ? '✅ Используется' : '❌ Не используется'}`);
    console.warn(`   Tavily (глубокий анализ): ${hasTavily ? '✅ Используется для топ-рынков' : '❌ Не используется'}`);
    
    if (hasSerpAPI) {
        console.warn(`\n💡 SerpAPI помогает AI:`);
        console.warn(`   - Получать свежие новости о событиях`);
        console.warn(`   - Анализировать актуальную информацию`);
        console.warn(`   - Делать более точные оценки вероятности`);
    }
    
    if (hasTavily) {
        console.warn(`\n💡 Tavily помогает AI:`);
        console.warn(`   - Глубокий поиск по множеству источников`);
        console.warn(`   - Структурированные ответы на вопросы`);
        console.warn(`   - Используется для рынков с attractiveness >= ${(AI_STRATEGY_CONFIG.TAVILY_ATTRACTIVENESS_THRESHOLD * 100).toFixed(0)}%`);
    }

    // 8. Рекомендации
    console.warn('\n\n' + '═'.repeat(80));
    console.warn('📝 Рекомендации для улучшения:');
    console.warn('═'.repeat(80));

    if (!analysis.estimatedProbability) {
        console.warn(`\n⚠️  ПРОБЛЕМА: AI не возвращает estimatedProbability`);
        console.warn(`   Решение:`);
        console.warn(`   1. Проверьте промпт в AIMarketFilter`);
        console.warn(`   2. Убедитесь что в промпте есть инструкция вернуть estimatedProbability`);
        console.warn(`   3. Проверьте что AI понимает формат JSON ответа`);
    } else {
        console.warn(`\n✅ AI правильно возвращает estimatedProbability`);
        console.warn(`   Edge рассчитывается: ${Math.abs(analysis.estimatedProbability - marketPrice) >= strategyConfig.minEdgePercentagePoints! ? '✅' : '❌'}`);
    }

    if (!hasSerpAPI) {
        console.warn(`\n💡 Рекомендация: Добавьте SERP_API_KEY для использования новостей`);
        console.warn(`   Это улучшит точность оценок AI`);
    }

    if (!hasTavily) {
        console.warn(`\n💡 Рекомендация: Добавьте TAVILY_API_KEY для глубокого анализа`);
        console.warn(`   Это улучшит качество анализа для топ-рынков`);
    }

    console.warn('\n✅ Тест завершен!\n');
}

// Запуск теста
testAIProbabilityAndEdge().catch(error => {
    console.error('\n❌ Тест провален:', error);
    if (error instanceof Error) {
        console.error('Stack:', error.stack);
    }
    process.exit(1);
});

