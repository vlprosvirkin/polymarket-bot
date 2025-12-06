/**
 * Контроллер для работы с рынками
 * Предоставляет endpoints для анализа, фильтрации и получения деталей рынков
 */

import { Request, Response } from 'express';
import { ClobClient } from '@polymarket/clob-client';
import { getErrorMessage, ErrorResponse } from '../../types/errors';
import { Market } from '../../types/market';
import { PolymarketDataService, EnrichedMarket } from '../../services/PolymarketDataService';
import { MarketFilter, MarketFilterConfig } from '../../services/MarketFilter';
import { AIMarketFilter } from '../../services/ai/ai-market-filter';

/**
 * Интерфейс для фильтров рынков из запроса
 */
interface MarketFiltersRequest {
    minPrice?: number;
    maxPrice?: number;
    minDaysToResolution?: number;
    maxDaysToResolution?: number;
    categories?: string[];
    excludeCategories?: string[];
    excludeNegRisk?: boolean;
    minLiquidity?: number;
    maxSpread?: number;
}

/**
 * Интерфейс для тела запроса filterMarkets
 */
interface FilterMarketsRequestBody {
    markets?: string[];
    filters?: MarketFiltersRequest;
}

export class MarketsController {
    private dataService: PolymarketDataService;
    private aiFilter: AIMarketFilter | null = null;

    constructor(private client: ClobClient) {
        this.dataService = new PolymarketDataService(client);
        
        // Инициализируем AI фильтр если есть ключи
        if (process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY) {
            try {
                const useNews = !!process.env.SERP_API_KEY;
                this.aiFilter = new AIMarketFilter(useNews);
            } catch (error) {
                console.warn('⚠️  AI Filter not available:', error);
            }
        }
    }

    /**
     * GET /api/markets/analyze
     * Получить список рынков с базовой информацией
     */
    async analyzeMarkets(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 100;
            const offset = parseInt(req.query.offset as string) || 0;
            const includeLiquidity = req.query.includeLiquidity === 'true';

            // Получаем рынки
            const response = await this.client.getSamplingMarkets();
            if (!response.data) {
                throw new Error('API returned no data');
            }

            let markets: Market[] = response.data as Market[];

            // Обогащаем данными ликвидности если нужно
            if (includeLiquidity) {
                const enrichedMarkets = await this.dataService.getEnrichedMarkets({
                    includeLiquidity: true
                });
                markets = enrichedMarkets;
            }

            // Применяем лимит и офсет
            const paginatedMarkets = markets.slice(offset, offset + limit);

            // Форматируем ответ
            const formatted = paginatedMarkets.map(market => {
                const yesToken = market.tokens?.find(t => t.outcome === 'Yes');
                const noToken = market.tokens?.find(t => t.outcome === 'No');
                const enriched: EnrichedMarket = market as EnrichedMarket;

                return {
                    condition_id: market.condition_id,
                    question: market.question,
                    description: market.description || '',
                    category: market.category || 'uncategorized',
                    tags: market.tags || [],
                    tokens: {
                        yes: yesToken ? {
                            token_id: yesToken.token_id,
                            price: yesToken.price,
                            pricePercent: `${(yesToken.price * 100).toFixed(2)}%`
                        } : null,
                        no: noToken ? {
                            token_id: noToken.token_id,
                            price: noToken.price,
                            pricePercent: `${(noToken.price * 100).toFixed(2)}%`
                        } : null
                    },
                    end_date_iso: market.end_date_iso,
                    active: market.active,
                    accepting_orders: market.accepting_orders,
                    closed: market.closed,
                    neg_risk: market.neg_risk || false,
                    liquidity: enriched.liquidityMetrics ? {
                        total: enriched.liquidityMetrics.totalMarketLiquidity || 
                               (enriched.liquidityMetrics.totalBidSize + enriched.liquidityMetrics.totalAskSize),
                        spread: enriched.liquidityMetrics.spreadPercent,
                        spreadPercent: `${enriched.liquidityMetrics.spreadPercent.toFixed(2)}%`,
                        hasLiquidity: enriched.liquidityMetrics.hasLiquidity
                    } : null
                };
            });

            return res.json({
                success: true,
                count: formatted.length,
                total: markets.length,
                offset,
                limit,
                markets: formatted
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            return res.status(500).json(errorResponse);
        }
    }

    /**
     * POST /api/markets/filter
     * Отфильтровать рынки по критериям
     */
    async filterMarkets(req: Request, res: Response) {
        try {
            const { markets: marketIds, filters } = req.body as FilterMarketsRequestBody;

            // Получаем рынки
            let allMarkets: Market[] = [];
            
            if (marketIds && Array.isArray(marketIds) && marketIds.length > 0) {
                // Если указаны конкретные markets, получаем их
                const response = await this.client.getSamplingMarkets();
                if (response.data) {
                    allMarkets = (response.data as Market[]).filter(m => 
                        marketIds.includes(m.condition_id)
                    );
                }
            } else {
                // Иначе получаем все
                const response = await this.client.getSamplingMarkets();
                if (response.data) {
                    allMarkets = response.data as Market[];
                }
            }

            if (!filters) {
                return res.json({
                    success: true,
                    filtered_count: allMarkets.length,
                    markets: allMarkets.map(m => ({
                        condition_id: m.condition_id,
                        question: m.question
                    }))
                });
            }

            // Продолжаем с фильтрацией

            // Применяем фильтры
            const filterConfig: MarketFilterConfig = {
                minPrice: filters?.minPrice,
                maxPrice: filters?.maxPrice,
                minDaysToResolution: filters?.minDaysToResolution,
                maxDaysToResolution: filters?.maxDaysToResolution,
                includedCategories: filters?.categories,
                excludedCategories: filters?.excludeCategories,
                excludeNegRisk: filters?.excludeNegRisk
            };

            let filtered = MarketFilter.filterWithConfig(allMarkets, filterConfig);

            // Фильтр по ликвидности если указан
            if (filters?.minLiquidity || filters?.maxSpread) {
                const enrichedMarkets = await this.dataService.getEnrichedMarkets({
                    includeLiquidity: true
                });

                filtered = filtered.filter(market => {
                    const enriched = enrichedMarkets.find(
                        e => e.condition_id === market.condition_id
                    );
                    
                    if (!enriched?.liquidityMetrics) {
                        return false;
                    }

                    const metrics = enriched.liquidityMetrics;
                    const totalLiquidity = metrics.totalMarketLiquidity || 
                                         (metrics.totalBidSize + metrics.totalAskSize);

                    if (filters.minLiquidity && totalLiquidity < filters.minLiquidity) {
                        return false;
                    }

                    if (filters.maxSpread && metrics.spreadPercent > filters.maxSpread * 100) {
                        return false;
                    }

                    return true;
                });
            }

            // Форматируем ответ
            const formatted = filtered.map(market => {
                const yesToken = market.tokens?.find(t => t.outcome === 'Yes');
                
                if (!yesToken || yesToken.price === undefined) {
                    // Пропускаем рынки без цены
                    return null;
                }

                return {
                    condition_id: market.condition_id,
                    question: market.question,
                    category: market.category || null,
                    yesPrice: yesToken.price
                };
            }).filter(m => m !== null);

            return res.json({
                success: true,
                filtered_count: formatted.length,
                total_count: allMarkets.length,
                markets: formatted
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            return res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/markets/:conditionId
     * Получить детальную информацию о рынке
     */
    async getMarketDetails(req: Request, res: Response) {
        try {
            const { conditionId } = req.params;

            if (!conditionId) {
                res.status(400).json({
                    success: false,
                    error: 'conditionId is required'
                });
                return;
            }

            // Получаем детали рынка
            const market = await this.dataService.getMarketDetails(conditionId);

            if (!market) {
                return res.status(404).json({
                    success: false,
                    error: 'Market not found'
                });
            }

            const yesToken = market.tokens?.find(t => t.outcome === 'Yes');
            const noToken = market.tokens?.find(t => t.outcome === 'No');
            const enriched: EnrichedMarket = market as EnrichedMarket;

            // Получаем лимит для orderbook из query параметра
            const orderbookLimit = parseInt(req.query.orderbookLimit as string) || 10;
            if (orderbookLimit < 1 || orderbookLimit > 50) {
                return res.status(400).json({
                    success: false,
                    error: 'orderbookLimit must be between 1 and 50'
                });
            }

            // Форматируем orderbook если есть
            const orderbook = enriched.orderbook ? {
                yes: {
                    bids: enriched.orderbook.bids.slice(0, orderbookLimit).map(b => ({
                        price: parseFloat(b.price),
                        size: parseFloat(b.size)
                    })),
                    asks: enriched.orderbook.asks.slice(0, orderbookLimit).map(a => ({
                        price: parseFloat(a.price),
                        size: parseFloat(a.size)
                    }))
                }
            } : null;

            return res.json({
                success: true,
                market: {
                    condition_id: market.condition_id,
                    question: market.question,
                    description: market.description || '',
                    category: market.category || 'uncategorized',
                    tags: market.tags || [],
                    tokens: {
                        yes: yesToken ? {
                            token_id: yesToken.token_id,
                            price: yesToken.price,
                            pricePercent: `${(yesToken.price * 100).toFixed(2)}%`
                        } : null,
                        no: noToken ? {
                            token_id: noToken.token_id,
                            price: noToken.price,
                            pricePercent: `${(noToken.price * 100).toFixed(2)}%`
                        } : null
                    },
                    resolution: {
                        end_date: market.end_date_iso
                        // resolution_source, method, criteria не доступны в Market типе
                        // Эти данные должны быть получены из другого источника API
                    },
                    liquidity: enriched.liquidityMetrics ? {
                        total: enriched.liquidityMetrics.totalMarketLiquidity || 
                               (enriched.liquidityMetrics.totalBidSize + enriched.liquidityMetrics.totalAskSize),
                        spread: enriched.liquidityMetrics.spreadPercent,
                        spreadPercent: `${enriched.liquidityMetrics.spreadPercent.toFixed(2)}%`,
                        orderbook
                    } : null,
                    status: {
                        active: market.active,
                        accepting_orders: market.accepting_orders,
                        closed: market.closed
                    }
                }
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            return res.status(500).json(errorResponse);
        }
    }

    /**
     * POST /api/markets/:conditionId/ai-analysis
     * Получить AI оценку рынка
     */
    async getAIAnalysis(req: Request, res: Response) {
        try {
            const { conditionId } = req.params;
            const { useDeepAnalysis } = req.body;

            if (!conditionId) {
                res.status(400).json({
                    success: false,
                    error: 'conditionId is required'
                });
                return;
            }

            if (!this.aiFilter) {
                return res.status(503).json({
                    success: false,
                    error: 'AI analysis not available. Set OPENAI_API_KEY or GEMINI_API_KEY'
                });
            }

            // Получаем рынок
            const market = await this.dataService.getMarketDetails(conditionId);
            if (!market) {
                return res.status(404).json({
                    success: false,
                    error: 'Market not found'
                });
            }

            // useNews и useDeepAnalysis обрабатываются через параметры analyzeMarket

            // Получаем AI анализ
            const analysis = await this.aiFilter.analyzeMarket(
                market,
                undefined,
                undefined,
                useDeepAnalysis === true // forceTavily
            );

            const yesToken = market.tokens?.find(t => t.outcome === 'Yes');
            if (!yesToken || yesToken.price === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Yes token not found or price not available for this market'
                });
            }
            const marketPrice = yesToken.price;

            return res.json({
                success: true,
                analysis: {
                    shouldTrade: analysis.shouldTrade,
                    confidence: analysis.confidence,
                    attractiveness: analysis.attractiveness,
                    estimatedProbability: analysis.estimatedProbability,
                    marketPrice,
                    edge: analysis.estimatedProbability 
                        ? analysis.estimatedProbability - marketPrice 
                        : 0,
                    riskLevel: analysis.riskLevel,
                    riskFactors: analysis.riskFactors || [],
                    opportunities: analysis.opportunities || [],
                    reasoning: analysis.reasoning,
                    sources: analysis.sources || [],
                    metadata: {
                        analysisDate: new Date().toISOString(),
                        newsCount: analysis.sources?.length || 0,
                        deepAnalysisUsed: useDeepAnalysis === true
                    }
                }
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            return res.status(500).json(errorResponse);
        }
    }
}

