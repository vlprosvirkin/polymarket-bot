/**
 * AI Strategy - стратегия на основе искусственного интеллекта
 * Использует AIMarketFilter для выбора рынков и AI для принятия решений
 * Вдохновлена подходом Poly-Trader
 */

import {
    Market,
    OrderSide,
    IStrategy,
    StrategyConfig,
    TradeSignal,
    Position
} from '../types';
import { AIMarketFilter, type FilterContext } from '../services/ai/ai-market-filter';
import { AI_STRATEGY_CONFIG } from '../core/config';
import { MarketFilter } from '../services/MarketFilter';
import { PolymarketDataService, type EnrichedMarket } from '../services/PolymarketDataService';
import { ClobClient } from '@polymarket/clob-client';

export interface AIStrategyConfig extends StrategyConfig {
    // AI настройки
    useAI: boolean;                    // Включить AI фильтрацию
    useNews: boolean;                  // Использовать SerpAPI для новостей
    minAIAttractiveness: number;      // Минимальная привлекательность от AI (0-1)
    maxAIRisk: 'low' | 'medium' | 'high';  // Максимальный риск по AI
    useAIForSignals: boolean;          // Использовать AI для генерации сигналов
    maxMarketsForAI?: number;          // Максимум рынков для AI анализа (по умолчанию 50)

    // Контроль бюджета AI
    maxAIBudgetPerCycle?: number;      // Макс $ за один цикл (по умолчанию 0.5)
    maxAIBudgetPerDay?: number;         // Макс $ за день (по умолчанию 5.0)

    // Кэширование
    aiCacheTTL?: number;                // Time-to-live для кэша в миллисекундах (по умолчанию 5 минут)

    // Фильтры ликвидности
    minLiquidity?: number;              // Минимальная общая ликвидность рынка в USDC (bid + ask, по умолчанию 1000)

    // Фильтр по edge (разница между AI оценкой и рыночной ценой)
    minEdgePercentagePoints?: number;  // Минимальный edge в процентных пунктах (0-1, по умолчанию 0.10 = 10 п.п.)
                                       // Edge = |AI_estimatedProbability - market_price|
                                       // Входим только если edge >= minEdgePercentagePoints

    // Дополнительные фильтры
    preferredCategories?: string[];    // Предпочтительные категории
    excludedCategories?: string[];     // Исключенные категории
}

export class AIStrategy implements IStrategy {
    name = "AI-Powered Strategy";
    config: AIStrategyConfig;
    private aiFilter: AIMarketFilter | null = null;
    // client хранится через dataService, нет необходимости в отдельном поле
    private dataService: PolymarketDataService | null = null;

    // Кэш AI анализа
    private analysisCache: Map<string, {
        analysis: import('../services/ai/ai-market-filter').MarketAnalysis;
        timestamp: number;
    }> = new Map();

    // Трекинг расходов AI
    private spendingTracker = {
        totalSpent: 0,
        dailyLimit: 5.0,      // $5 по умолчанию
        cycleLimit: 0.5,      // $0.50 за цикл
        lastReset: new Date().toDateString()
    };

    // Константы
    private readonly CACHE_TTL: number;
    private readonly COST_PER_MARKET_WITHOUT_NEWS = 0.008; // $0.008 за рынок
    private readonly COST_PER_MARKET_WITH_NEWS = 0.015;    // $0.015 за рынок

    constructor(config: AIStrategyConfig) {
        this.config = config;

        // Настройка кэша и бюджета
        this.CACHE_TTL = config.aiCacheTTL || (5 * 60 * 1000); // 5 минут по умолчанию
        this.spendingTracker.dailyLimit = config.maxAIBudgetPerDay || 5.0;
        this.spendingTracker.cycleLimit = config.maxAIBudgetPerCycle || 0.5;

        if (config.useAI) {
            try {
                this.aiFilter = new AIMarketFilter(config.useNews);
                console.log(`✅ AI Strategy initialized (news: ${config.useNews}, cache: ${this.CACHE_TTL}ms, budget: $${this.spendingTracker.dailyLimit}/day)`);
            } catch (error) {
                console.warn('⚠️  Failed to initialize AI Filter:', error);
                this.config.useAI = false;
            }
        }
    }

    setClient(client: ClobClient): void {
        // Сохраняем client через dataService для работы с обогащенными данными
        this.dataService = new PolymarketDataService(client);
    }

    filterMarkets(markets: Market[]): Market[] {
        // Базовая фильтрация (без volume - его нет в API)
        const filtered = MarketFilter.filterWithConfig(markets, {
            // minVolume не используется - volume нет в API
            minPrice: this.config.minPrice,
            maxPrice: this.config.maxPrice,
            excludeNegRisk: this.config.excludeNegRisk,
            includedCategories: this.config.preferredCategories,
            excludedCategories: this.config.excludedCategories
        });
        return filtered.slice(0, this.config.maxMarkets);
    }

    async asyncFilterMarkets(markets: Market[]): Promise<Market[]> {
        // Очистка кэша от устаревших записей
        this.cleanCache();

        // Базовая фильтрация через MarketFilter (без volume - его нет в API)
        // Фильтруем только по тому что есть: цена, NegRisk, категории
        console.log(`\n🔍 ЭТАП 1.1: Базовая фильтрация ${markets.length} рынков`);
        console.log(`   📋 Критерии фильтрации:`);
        console.log(`      - Цена YES: ${(this.config.minPrice || 0) * 100}% - ${(this.config.maxPrice || 1) * 100}%`);
        console.log(`      - Исключить NegRisk: ${this.config.excludeNegRisk ? 'да' : 'нет'}`);
        if (this.config.preferredCategories && this.config.preferredCategories.length > 0) {
            console.log(`      - Предпочтительные категории: ${this.config.preferredCategories.join(', ')}`);
        }
        if (this.config.excludedCategories && this.config.excludedCategories.length > 0) {
            console.log(`      - Исключенные категории: ${this.config.excludedCategories.join(', ')}`);
        }
        
        let basicFiltered = MarketFilter.filterWithConfig(markets, {
            // minVolume НЕ используется - volume отсутствует в API
            minPrice: this.config.minPrice,
            maxPrice: this.config.maxPrice,
            excludeNegRisk: this.config.excludeNegRisk,
            includedCategories: this.config.preferredCategories,
            excludedCategories: this.config.excludedCategories
        }, true); // verbose = true для детального логирования

        // Если настроена проверка ликвидности через orderbook (minLiquidity > 0 и есть dataService)
        // То используем PolymarketDataService для получения реальной ликвидности из orderbook
        // ⚠️ minVolume удален - используем minLiquidity из конфига для проверки ликвидности
        // Ликвидность = общая сумма всех ордеров (YES + NO) в USDC
        // Учитываем оба токена, так как стратегии могут торговать и YES и NO
        // (например, для хеджирования в HighConfidenceStrategy и EndgameStrategy)
        const minLiquidity = (this.config as { minLiquidity?: number }).minLiquidity || 1000;
        
        if (this.dataService && minLiquidity > 0) {
            console.log(`\n🔍 ЭТАП 1.2: Проверка ликвидности из orderbook`);
            console.log(`   📊 Параметры:`);
            console.log(`      - Минимальная ликвидность: $${minLiquidity}`);
            console.log(`      - Максимальный спред: 99.5 процентных пунктов (практически не ограничивает, так как на неликвидных рынках спред может быть 97-99)`);
            console.log(`      - Минимум уровней в orderbook: 3`);
            console.log(`   🔄 Проверка ликвидности для ${basicFiltered.length} рынков...`);
            
            try {
                // Обогащаем отфильтрованные рынки данными о ликвидности из orderbook
                const enrichedMarkets: EnrichedMarket[] = [];
                
                // Ограничиваем количество для проверки (чтобы не перегружать API)
                const marketsToCheck = basicFiltered.slice(0, 50);
                console.log(`   📋 Ограничено до ${marketsToCheck.length} рынков для проверки API`);
                
                let checkedCount = 0;
                let successCount = 0;
                let errorCount = 0;
                
                for (const market of marketsToCheck) {
                    checkedCount++;
                    if (checkedCount % 10 === 0) {
                        console.log(`   ⏳ Прогресс: ${checkedCount}/${marketsToCheck.length} (успешно: ${successCount}, ошибок: ${errorCount})...`);
                    }
                    try {
                        const enriched = await this.dataService.getMarketDetails(market.condition_id);
                        if (enriched && enriched.liquidityMetrics) {
                            enrichedMarkets.push(enriched);
                            successCount++;
                            
                            // Логируем метрики ликвидности
                            const metrics = enriched.liquidityMetrics;
                            // Ликвидность = общая сумма всех ордеров (YES + NO) или только YES
                            const totalLiquidity = metrics.totalMarketLiquidity !== undefined
                                ? metrics.totalMarketLiquidity  // Общая (YES + NO)
                                : metrics.totalBidSize + metrics.totalAskSize; // Только YES
                            const bestBid = enriched.orderbook?.bids[0]?.price ? parseFloat(enriched.orderbook.bids[0].price) : 0;
                            const bestAsk = enriched.orderbook?.asks[0]?.price ? parseFloat(enriched.orderbook.asks[0].price) : 1;
                            console.log(`      ✅ ${market.question.substring(0, 40)}...`);
                            if (metrics.totalMarketLiquidity !== undefined) {
                                console.log(`         Ликвидность: $${totalLiquidity.toFixed(0)} (YES: $${(metrics.totalBidSize + metrics.totalAskSize).toFixed(0)}, NO: $${((metrics.noTotalBidSize || 0) + (metrics.noTotalAskSize || 0)).toFixed(0)})`);
                            } else {
                                console.log(`         Ликвидность YES: $${totalLiquidity.toFixed(0)} (Bid: $${metrics.totalBidSize.toFixed(0)}, Ask: $${metrics.totalAskSize.toFixed(0)})`);
                            }
                            console.log(`         Спред YES: ${metrics.spreadPercent.toFixed(2)} п.п., Цены: Bid ${(bestBid * 100).toFixed(2)}% / Ask ${(bestAsk * 100).toFixed(2)}%`);
                        } else {
                            errorCount++;
                            console.log(`      ⚠️  ${market.question.substring(0, 40)}... - нет данных о ликвидности`);
                        }
                    } catch (error) {
                        errorCount++;
                        if (checkedCount <= 5) { // Логируем первые 5 ошибок
                            console.warn(`      ❌ Ошибка для ${market.question.substring(0, 30)}...:`, error instanceof Error ? error.message : String(error));
                        }
                    }
                }
                
                console.log(`\n   📊 Статистика проверки ликвидности:`);
                console.log(`      - Проверено: ${checkedCount} рынков`);
                console.log(`      - Получено данных: ${successCount}`);
                console.log(`      - Ошибок: ${errorCount}`);
                console.log(`      - Обогащенных рынков: ${enrichedMarkets.length}`);

                if (enrichedMarkets.length > 0) {
                    console.log(`\n   🔍 Фильтрация по критериям ликвидности...`);
                    // Фильтруем обогащенные рынки по ликвидности через MarketFilter
                    // Для рынков предсказаний спред считается в абсолютных процентных пунктах
                    // Например: bid=1%, ask=99% = 98 процентных пунктов спреда
                    // Допустим спред до 95 процентных пунктов (почти весь диапазон 0-100%)
                    const maxSpreadPercent = 99.5; // 99.5 процентных пунктов - практически не ограничивает
                    const beforeFilter = enrichedMarkets.length;
                    const liquidMarkets = MarketFilter.filterEnrichedForTrading(
                        enrichedMarkets,
                        minLiquidity,     // Минимальная ликвидность из orderbook
                        maxSpreadPercent, // Максимальный спред 50%
                        3                 // Минимум 3 уровня в orderbook
                    );
                    const afterFilter = liquidMarkets.length;
                    
                    console.log(`      - До фильтрации: ${beforeFilter} рынков`);
                    console.log(`      - После фильтрации: ${afterFilter} рынков`);
                    console.log(`      - Отфильтровано: ${beforeFilter - afterFilter} рынков`);

                    // Оставляем только рынки с достаточной ликвидностью
                    const liquidMarketIds = new Set(liquidMarkets.map(em => em.condition_id));
                    const beforeBasicFilter = basicFiltered.length;
                    basicFiltered = basicFiltered.filter(m => 
                        liquidMarketIds.has(m.condition_id) || marketsToCheck.indexOf(m) === -1
                    );
                    const afterBasicFilter = basicFiltered.length;

                    console.log(`\n   ✅ Результат фильтрации ликвидности:`);
                    console.log(`      - Рынков до проверки ликвидности: ${beforeBasicFilter}`);
                    console.log(`      - Рынков после проверки ликвидности: ${afterBasicFilter}`);
                    console.log(`      - Отфильтровано: ${beforeBasicFilter - afterBasicFilter} рынков`);
                    
                    if (afterBasicFilter === 0 && beforeBasicFilter > 0) {
                        console.log(`\n   ⚠️  ВНИМАНИЕ: Все рынки отфильтрованы из-за недостаточной ликвидности!`);
                        console.log(`      Попробуйте снизить minLiquidity (сейчас: $${minLiquidity})`);
                        console.log(`      Или увеличьте maxSpread (сейчас: ${maxSpreadPercent}%)`);
                    }
                } else {
                    console.log(`\n   ⚠️  Не удалось получить данные о ликвидности для ни одного рынка`);
                    console.log(`      Возможные причины:`);
                    console.log(`      - Рынки не имеют ликвидности в orderbook`);
                    console.log(`      - Проблемы с API Polymarket`);
                    console.log(`      - Токены не найдены в orderbook`);
                    console.log(`   💡 Используем базовую фильтрацию без проверки ликвидности`);
                }
            } catch (error) {
                console.error('\n   ❌ Ошибка при проверке ликвидности:', error);
                console.log(`   💡 Продолжаем с базовой фильтрацией`);
            }
        } else {
            console.log(`\n   ℹ️  Проверка ликвидности пропущена:`);
            console.log(`      - dataService: ${this.dataService ? 'есть' : 'отсутствует'}`);
            console.log(`      - minLiquidity: ${minLiquidity}`);
        }

        if (!this.config.useAI || !this.aiFilter) {
            console.log(`\n   ℹ️  AI фильтрация отключена, возвращаем базовую фильтрацию`);
            const result = basicFiltered.slice(0, this.config.maxMarkets);
            console.log(`   ✅ Финальный результат: ${result.length} рынков (макс: ${this.config.maxMarkets})`);
            return result;
        }

        try {
            // Проверка дневного бюджета
            const today = new Date().toDateString();
            if (this.spendingTracker.lastReset !== today) {
                // Новый день - сброс
                this.spendingTracker.totalSpent = 0;
                this.spendingTracker.lastReset = today;
                console.log('💰 Daily AI budget reset');
            }

            if (this.spendingTracker.totalSpent >= this.spendingTracker.dailyLimit) {
                console.warn(`⚠️  Daily AI budget ($${this.spendingTracker.dailyLimit}) exceeded. Using basic filter.`);
                console.warn(`    Spent today: $${this.spendingTracker.totalSpent.toFixed(2)}`);
                return basicFiltered.slice(0, this.config.maxMarkets);
            }

            // Расчет максимального количества рынков на основе бюджета
            const costPerMarket = this.config.useNews
                ? this.COST_PER_MARKET_WITH_NEWS
                : this.COST_PER_MARKET_WITHOUT_NEWS;

            const remainingBudget = Math.min(
                this.spendingTracker.dailyLimit - this.spendingTracker.totalSpent,
                this.spendingTracker.cycleLimit
            );

            const maxMarketsForBudget = Math.floor(remainingBudget / costPerMarket);

            if (maxMarketsForBudget === 0) {
                console.warn(`⚠️  No budget remaining for AI analysis (spent: $${this.spendingTracker.totalSpent.toFixed(2)})`);
                return basicFiltered.slice(0, this.config.maxMarkets);
            }

            // Ограничение по конфигурации и бюджету
            const maxForAI = Math.min(
                this.config.maxMarketsForAI || AI_STRATEGY_CONFIG.MAX_MARKETS_FOR_AI,
                maxMarketsForBudget,
                basicFiltered.length
            );

            console.log(`💰 AI Budget: $${remainingBudget.toFixed(2)} remaining → analyzing max ${maxForAI} markets`);

            // Сортировка и отбор рынков
            let marketsForAI = basicFiltered;

            if (basicFiltered.length > maxForAI) {
                marketsForAI = this.sortMarketsForAI(basicFiltered).slice(0, maxForAI);
                console.log(`📊 Selected top ${maxForAI} markets by score for AI analysis`);
            }

            const filterContext: FilterContext = {
                strategyType: AI_STRATEGY_CONFIG.STRATEGY_TYPE,
                minAttractiveness: this.config.minAIAttractiveness,
                maxRisk: this.config.maxAIRisk,
                preferredCategories: this.config.preferredCategories,
                excludedCategories: this.config.excludedCategories
            };

            console.log(`\n🔍 ЭТАП 1.3: AI анализ рынков`);
            console.log(`   🤖 AI analyzing ${marketsForAI.length} markets...`);
            console.log(`   📋 Параметры AI анализа:`);
            console.log(`      - Min Attractiveness: ${(this.config.minAIAttractiveness * 100).toFixed(0)}%`);
            console.log(`      - Max Risk: ${this.config.maxAIRisk.toUpperCase()}`);
            console.log(`      - Strategy Type: ${filterContext.strategyType}`);
            
            const aiSelected = await this.aiFilter.filterMarkets(marketsForAI, filterContext);

            // Сохранить результаты в кэш
            aiSelected.forEach(item => {
                this.analysisCache.set(item.market.condition_id, {
                    analysis: item.analysis,
                    timestamp: Date.now()
                });
            });

            // Трекинг расходов
            const estimatedCost = marketsForAI.length * costPerMarket;
            this.spendingTracker.totalSpent += estimatedCost;

            console.log(`\n   ✅ Результат AI анализа:`);
            console.log(`      - Проанализировано: ${marketsForAI.length} рынков`);
            console.log(`      - Выбрано AI: ${aiSelected.length} рынков`);
            console.log(`      - Отфильтровано: ${marketsForAI.length - aiSelected.length} рынков`);
            console.log(`      - Расход: $${estimatedCost.toFixed(3)}`);
            console.log(`      - Всего потрачено сегодня: $${this.spendingTracker.totalSpent.toFixed(2)}/$${this.spendingTracker.dailyLimit}`);

            const finalMarkets = aiSelected.map(item => item.market);
            console.log(`\n   ✅ ФИНАЛЬНЫЙ РЕЗУЛЬТАТ: ${finalMarkets.length} рынков для торговли`);
            return finalMarkets;

        } catch (error) {
            console.error('\n   ❌ Ошибка в AI фильтрации:', error);
            console.error('   💡 Используем базовую фильтрацию как fallback');
            const fallback = basicFiltered.slice(0, this.config.maxMarkets);
            console.log(`   ✅ Fallback результат: ${fallback.length} рынков`);
            return fallback;
        }
    }


    generateSignals(market: Market, currentPrice: number, _position?: Position): TradeSignal[] {
        if (!this.config.useAIForSignals) {
            return this.generateBasicSignals(market, currentPrice);
        }
        console.warn('⚠️  Use asyncGenerateSignals() for AI analysis');
        return this.generateBasicSignals(market, currentPrice);
    }

    async asyncGenerateSignals(market: Market, currentPrice: number, position?: Position): Promise<TradeSignal[]> {
        const signals: TradeSignal[] = [];

        if (position && position.size > 0) {
            return signals;
        }

        if (this.config.useAIForSignals && this.aiFilter) {
            try {
                // Проверяем кэш
                const cached = this.analysisCache.get(market.condition_id);
                let analysis: import('../services/ai/ai-market-filter').MarketAnalysis;

                if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
                    // Используем из кэша
                    analysis = cached.analysis;
                    console.log(`📦 Using cached AI analysis for ${market.question.substring(0, 50)}...`);
                } else {
                    // Новый AI анализ
                    analysis = await this.aiFilter.analyzeMarket(market, {
                        strategyType: AI_STRATEGY_CONFIG.STRATEGY_TYPE,
                        minAttractiveness: this.config.minAIAttractiveness,
                        maxRisk: this.config.maxAIRisk
                    });

                    // Сохранить в кэш
                    this.analysisCache.set(market.condition_id, {
                        analysis,
                        timestamp: Date.now()
                    });

                    console.log(`🤖 Fresh AI analysis for ${market.question.substring(0, 50)}...`);
                }

                if (!analysis.shouldTrade || analysis.recommendedAction === 'AVOID') {
                    return signals;
                }

                if (this.config.maxAIRisk === 'low' && analysis.riskLevel !== 'low') {
                    return signals;
                }

                const yesToken = market.tokens.find(t => t.outcome === 'Yes');
                const noToken = market.tokens.find(t => t.outcome === 'No');
                if (!yesToken || !noToken) return signals;

                // Получаем минимальный edge из конфига
                const minEdge = this.config.minEdgePercentagePoints ?? AI_STRATEGY_CONFIG.MIN_EDGE_PERCENTAGE_POINTS;
                
                // Если AI дал оценку вероятности, сравниваем с рыночной ценой (edge)
                let edge: number | undefined;
                let edgeReason = '';
                if (analysis.estimatedProbability !== undefined) {
                    // Edge = разница между AI оценкой и рыночной ценой
                    edge = Math.abs(analysis.estimatedProbability - currentPrice);
                    const aiProbPercent = (analysis.estimatedProbability * 100).toFixed(1);
                    const marketPercent = (currentPrice * 100).toFixed(1);
                    const edgePercent = (edge * 100).toFixed(1);
                    
                    if (analysis.estimatedProbability > currentPrice) {
                        edgeReason = `AI ${aiProbPercent}% > Market ${marketPercent}% (edge: +${edgePercent} п.п.)`;
                    } else {
                        edgeReason = `AI ${aiProbPercent}% < Market ${marketPercent}% (edge: -${edgePercent} п.п.)`;
                    }
                    
                    // Проверяем edge для BUY_YES
                    if (edge < minEdge) {
                        console.log(`      ⚠️  Edge слишком мал: ${(edge * 100).toFixed(1)} п.п. < ${(minEdge * 100).toFixed(1)} п.п. (пропускаем)`);
                        return signals; // Edge недостаточен для входа
                    }
                }

                // BUY_YES: если AI рекомендует или attractiveness высокая, И edge достаточен
                if (analysis.recommendedAction === 'BUY_YES' || 
                    (analysis.attractiveness > AI_STRATEGY_CONFIG.ATTRACTIVENESS_THRESHOLD_FOR_SIGNALS && !analysis.recommendedAction)) {
                    
                    // Дополнительная проверка: если AI дал оценку вероятности, она должна быть > рыночной для BUY_YES
                    if (analysis.estimatedProbability !== undefined) {
                        if (analysis.estimatedProbability <= currentPrice) {
                            console.log(`      ⚠️  AI оценка (${(analysis.estimatedProbability * 100).toFixed(1)}%) <= рыночная цена (${(currentPrice * 100).toFixed(1)}%) - нет edge для BUY_YES`);
                            return signals;
                        }
                    }
                    
                    const size = this.calculateOrderSize(currentPrice, analysis.attractiveness);
                    
                    if (size >= market.minimum_order_size) {
                        const reason = edge 
                            ? `AI: ${edgeReason} | ${analysis.reasoning.substring(0, 50)}... (attr: ${(analysis.attractiveness * 100).toFixed(1)}%)`
                            : `AI: ${analysis.reasoning.substring(0, 80)}... (${(analysis.attractiveness * 100).toFixed(1)}%)`;
                        
                        signals.push({
                            market,
                            tokenId: yesToken.token_id,
                            side: OrderSide.BUY,
                            price: currentPrice,
                            size,
                            reason
                        });
                    }
                }

                // BUY_NO: если AI рекомендует NO, проверяем edge для NO
                if (analysis.recommendedAction === 'BUY_NO') {
                    const noPrice = 1 - currentPrice;
                    const noProbability = analysis.estimatedProbability !== undefined 
                        ? 1 - analysis.estimatedProbability 
                        : undefined;
                    
                    // Если AI дал оценку вероятности для NO
                    if (noProbability !== undefined) {
                        const noEdge = Math.abs(noProbability - noPrice);
                        if (noEdge < minEdge) {
                            console.log(`      ⚠️  Edge для NO слишком мал: ${(noEdge * 100).toFixed(1)} п.п. < ${(minEdge * 100).toFixed(1)} п.п. (пропускаем)`);
                            return signals;
                        }
                        
                        if (noProbability <= noPrice) {
                            console.log(`      ⚠️  AI оценка NO (${(noProbability * 100).toFixed(1)}%) <= рыночная цена NO (${(noPrice * 100).toFixed(1)}%) - нет edge`);
                            return signals;
                        }
                    }
                    
                    const size = this.calculateOrderSize(noPrice, analysis.attractiveness);
                    
                    if (size >= market.minimum_order_size) {
                        const noEdgeReason = noProbability !== undefined
                            ? `AI NO: ${(noProbability * 100).toFixed(1)}% > Market NO: ${(noPrice * 100).toFixed(1)}% (edge: +${((noProbability - noPrice) * 100).toFixed(1)} п.п.)`
                            : '';
                        const reason = noEdgeReason 
                            ? `AI: ${noEdgeReason} | ${analysis.reasoning.substring(0, 50)}...`
                            : `AI: ${analysis.reasoning.substring(0, 80)}... (${(analysis.attractiveness * 100).toFixed(1)}%)`;
                        
                        signals.push({
                            market,
                            tokenId: noToken.token_id,
                            side: OrderSide.BUY,
                            price: noPrice,
                            size,
                            reason
                        });
                    }
                }

                return signals;
            } catch (error) {
                console.error('❌ AI signal generation failed:', error);
            }
        }

        return this.generateBasicSignals(market, currentPrice);
    }

    private generateBasicSignals(market: Market, currentPrice: number): TradeSignal[] {
        const signals: TradeSignal[] = [];
        const yesToken = market.tokens.find(t => t.outcome === 'Yes');

        if (!yesToken) return signals;

        if ((!this.config.minPrice || currentPrice >= this.config.minPrice) &&
            (!this.config.maxPrice || currentPrice <= this.config.maxPrice)) {
            
            const size = this.config.orderSize;
            
            if (size >= market.minimum_order_size) {
                signals.push({
                    market,
                    tokenId: yesToken.token_id,
                    side: OrderSide.BUY,
                    price: currentPrice,
                    size,
                    reason: `Basic signal: ${(currentPrice * 100).toFixed(2)}%`
                });
            }
        }

        return signals;
    }

    private calculateOrderSize(_price: number, attractiveness: number): number {
        const multiplier = 1 + attractiveness;
        const adjustedSize = Math.floor(this.config.orderSize * multiplier);
        return Math.min(adjustedSize, this.config.maxPosition);
    }

    /**
     * Очистка устаревших записей из кэша
     */
    private cleanCache(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, value] of this.analysisCache.entries()) {
            if (now - value.timestamp > this.CACHE_TTL) {
                this.analysisCache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🗑️  Cleaned ${cleaned} expired cache entries`);
        }
    }

    /**
     * Умная сортировка рынков для AI анализа
     * Использует MarketFilter.sortForAI который учитывает объем, близость к разрешению и категории
     */
    private sortMarketsForAI(markets: Market[]): Market[] {
        return MarketFilter.sortForAI(markets, this.config.preferredCategories);
    }

    shouldClosePosition(_market: Market, position: Position, currentPrice: number): boolean {
        if (this.config.profitThreshold > 0) {
            const profitPercent = (currentPrice - position.averagePrice) / position.averagePrice;
            if (profitPercent >= this.config.profitThreshold) {
                return true;
            }
        }

        if (this.config.stopLoss && this.config.stopLoss > 0) {
            const lossPercent = (position.averagePrice - currentPrice) / position.averagePrice;
            if (lossPercent >= this.config.stopLoss) {
                return true;
            }
        }

        return false;
    }

    getDescription(): string {
        let desc = `AI-Powered Strategy\n`;
        desc += `- AI: ${this.config.useAI ? '✅' : '❌'}\n`;
        if (this.config.useAI) {
            desc += `- News: ${this.config.useNews ? '✅' : '❌'}\n`;
            desc += `- Min Attractiveness: ${(this.config.minAIAttractiveness * 100).toFixed(0)}%\n`;
            desc += `- Max Risk: ${this.config.maxAIRisk.toUpperCase()}\n`;
            desc += `- Max Markets for AI: ${this.config.maxMarketsForAI || AI_STRATEGY_CONFIG.MAX_MARKETS_FOR_AI}\n`;
            desc += `- Cache TTL: ${(this.CACHE_TTL / 1000 / 60).toFixed(1)} min\n`;
            desc += `- Daily Budget: $${this.spendingTracker.dailyLimit} (spent: $${this.spendingTracker.totalSpent.toFixed(2)})\n`;
            desc += `- Cycle Budget: $${this.spendingTracker.cycleLimit}\n`;
            desc += `- Cache Size: ${this.analysisCache.size} entries\n`;
        }
        desc += `- Order Size: ${this.config.orderSize}\n`;
        desc += `- Max Markets: ${this.config.maxMarkets}\n`;
        return desc;
    }
}

