/**
 * CryptoAgent - Специализированный агент для анализа крипто-рынков
 *
 * Особенности:
 * - Анализ рынков про Bitcoin, Ethereum, altcoins
 * - Учет цены, капитализации, волатильности
 * - ETF approval, регуляторные события
 * - Halving, upgrades, технические события
 *
 * MCP Integration:
 * - coingecko: Реальные цены криптовалют
 * - tavily: Поиск новостей о крипто
 * - alphavantage: Дополнительные финансовые данные
 */

import {
    BaseEventAgent,
    AgentRecommendation,
    AnalysisContext,
    AgentConfig,
    NewsItem
} from './BaseEventAgent';
import { EnrichedMarket } from '../adapters/polymarket-data.adapter';

/**
 * Данные о криптовалюте из MCP
 */
interface CryptoPriceData {
    price: number;
    change24h?: number;
    marketCap?: number;
    volume24h?: number;
}

/**
 * Конфигурация крипто агента
 */
export interface CryptoAgentConfig extends Partial<AgentConfig> {
    /** Минимальный edge для рекомендации */
    minEdge?: number;
    /** Учитывать волатильность */
    considerVolatility?: boolean;
}

/**
 * Информация о крипто событии
 */
interface CryptoEventInfo {
    type?: 'price' | 'etf' | 'regulation' | 'upgrade' | 'halving' | 'other';
    asset?: string;
    priceTarget?: number;
    direction?: 'above' | 'below';
    deadline?: Date;
}

/**
 * CryptoAgent - Агент для анализа крипто-рынков
 */
export class CryptoAgent extends BaseEventAgent {
    private cryptoConfig: CryptoAgentConfig;

    // Ключевые слова для крипто событий
    private static readonly CRYPTO_KEYWORDS: Record<string, string[]> = {
        bitcoin: ['bitcoin', 'btc', 'satoshi', 'halving', 'lightning network'],
        ethereum: ['ethereum', 'eth', 'vitalik', 'merge', 'eip', 'layer 2', 'rollup'],
        altcoins: ['solana', 'sol', 'cardano', 'ada', 'polkadot', 'dot', 'avalanche', 'avax', 'polygon', 'matic', 'xrp', 'ripple', 'dogecoin', 'doge', 'shiba'],
        defi: ['defi', 'uniswap', 'aave', 'compound', 'maker', 'dao', 'yield', 'staking'],
        regulatory: ['sec', 'etf', 'regulation', 'ban', 'legal', 'approve', 'reject', 'lawsuit', 'court'],
        general: ['crypto', 'cryptocurrency', 'blockchain', 'token', 'coin', 'market cap', 'ath', 'all-time high']
    };

    // Известные активы с тикерами
    private static readonly KNOWN_ASSETS: Record<string, string> = {
        'bitcoin': 'BTC',
        'btc': 'BTC',
        'ethereum': 'ETH',
        'eth': 'ETH',
        'solana': 'SOL',
        'sol': 'SOL',
        'cardano': 'ADA',
        'xrp': 'XRP',
        'ripple': 'XRP',
        'dogecoin': 'DOGE',
        'doge': 'DOGE',
        'polygon': 'MATIC',
        'matic': 'MATIC'
    };

    constructor(config: CryptoAgentConfig = {}) {
        super({
            name: 'CryptoAgent',
            minConfidence: config.minConfidence ?? 0.55,
            ...config
        });

        // Валидация minEdge
        if (config.minEdge !== undefined) {
            if (config.minEdge < 0 || config.minEdge > 1) {
                throw new Error(`Invalid minEdge: ${config.minEdge}. Must be between 0 and 1`);
            }
        }

        this.cryptoConfig = {
            minEdge: config.minEdge ?? 0.04,
            considerVolatility: config.considerVolatility ?? true
        };
    }

    /**
     * Инициализация MCP серверов для крипто данных
     * Подключает coingecko для цен и tavily для новостей
     */
    async initializeMCPServers(): Promise<string[]> {
        const connected: string[] = [];

        // Подключаем CoinGecko для цен криптовалют (бесплатный)
        try {
            await this.connectMCP('coingecko', 'npx', ['-y', '@anthropic/mcp-server-coingecko']);
            connected.push('coingecko');
            console.warn(`📡 ${this.config.name}: Connected to CoinGecko MCP`);
        } catch (error) {
            console.warn(`⚠️ ${this.config.name}: Failed to connect CoinGecko:`, error);
        }

        // Подключаем Tavily для поиска новостей (требует API ключ)
        if (process.env.TAVILY_API_KEY) {
            try {
                await this.connectMCP('tavily', 'npx', ['-y', '@anthropic/mcp-server-tavily']);
                connected.push('tavily');
                console.warn(`📡 ${this.config.name}: Connected to Tavily MCP`);
            } catch (error) {
                console.warn(`⚠️ ${this.config.name}: Failed to connect Tavily:`, error);
            }
        }

        return connected;
    }

    /**
     * Получение цены криптовалюты через MCP CoinGecko
     */
    async getCryptoPrice(asset: string): Promise<CryptoPriceData | null> {
        if (!this.mcpConnected.has('coingecko')) {
            return null;
        }

        // Маппинг тикеров на CoinGecko ID
        const coinGeckoIds: Record<string, string> = {
            'BTC': 'bitcoin',
            'ETH': 'ethereum',
            'SOL': 'solana',
            'ADA': 'cardano',
            'XRP': 'ripple',
            'DOGE': 'dogecoin',
            'MATIC': 'polygon',
            'DOT': 'polkadot',
            'AVAX': 'avalanche-2'
        };

        const coinId = coinGeckoIds[asset.toUpperCase()] || asset.toLowerCase();

        try {
            const result = await this.callMCPTool('coingecko', 'get_coin_price', {
                coin_id: coinId,
                vs_currency: 'usd'
            });

            if (result && typeof result === 'object') {
                const data = result as unknown as Record<string, unknown>;
                return {
                    price: Number(data.price) || 0,
                    change24h: Number(data.price_change_24h) || undefined,
                    marketCap: Number(data.market_cap) || undefined,
                    volume24h: Number(data.total_volume) || undefined
                };
            }
        } catch (error) {
            console.warn(`⚠️ ${this.config.name}: Failed to get price for ${asset}:`, error);
        }

        return null;
    }

    /**
     * Поиск крипто новостей через MCP Tavily
     */
    async searchCryptoNews(query: string): Promise<NewsItem[]> {
        if (!this.mcpConnected.has('tavily')) {
            return [];
        }

        try {
            const result = await this.callMCPTool('tavily', 'search', {
                query: `${query} cryptocurrency news`,
                max_results: 5,
                search_depth: 'basic'
            });

            return this.parseMCPSearchResult(result);
        } catch (error) {
            console.warn(`⚠️ ${this.config.name}: Failed to search news:`, error);
        }

        return [];
    }

    getCategory(): string {
        return 'crypto';
    }

    getKeywords(): string[] {
        const allKeywords: string[] = [];
        for (const keywords of Object.values(CryptoAgent.CRYPTO_KEYWORDS)) {
            allKeywords.push(...keywords);
        }
        return allKeywords;
    }

    async analyze(market: EnrichedMarket, context?: AnalysisContext): Promise<AgentRecommendation> {
        const currentPrice = this.getYesPrice(market);

        // FAIL-FAST: Без цены невозможно принять решение о ставке
        if (currentPrice === null) {
            return this.getDefaultRecommendation('No YES token price available - cannot analyze');
        }

        // 1. Извлекаем информацию о событии
        const eventInfo = this.extractEventInfo(market);

        // 2. Получаем реальную цену через MCP если это ценовой рынок
        let mcpPriceData: CryptoPriceData | null = null;
        if (eventInfo.type === 'price' && eventInfo.asset) {
            mcpPriceData = await this.getCryptoPrice(eventInfo.asset);
            if (mcpPriceData) {
                console.warn(`📊 ${this.config.name}: Got ${eventInfo.asset} price from MCP: $${mcpPriceData.price.toLocaleString()}`);
            }
        }

        // 3. Анализируем новости (из контекста или через MCP)
        let newsAnalysis = { sentiment: 0, insights: '', sources: [] as string[] };
        if (context?.recentNews && context.recentNews.length > 0) {
            newsAnalysis = this.analyzeNews(context.recentNews, eventInfo);
        } else if (eventInfo.asset) {
            // Пробуем получить новости через MCP Tavily
            const mcpNews = await this.searchCryptoNews(eventInfo.asset);
            if (mcpNews.length > 0) {
                newsAnalysis = this.analyzeNews(mcpNews, eventInfo);
                console.warn(`📰 ${this.config.name}: Got ${mcpNews.length} news items from MCP`);
            }
        }

        // 4. Применяем крипто-специфичные эвристики (учитываем MCP данные)
        const heuristicAnalysis = this.applyHeuristics(market, eventInfo, mcpPriceData);

        // 5. Учитываем волатильность
        const volatilityAdjustment = this.cryptoConfig.considerVolatility
            ? this.applyVolatilityAdjustment(eventInfo, currentPrice, mcpPriceData)
            : 0;

        // 6. Комбинируем анализ
        const estimatedProbability = this.combineProbabilities(
            currentPrice,
            heuristicAnalysis.probability,
            newsAnalysis.sentiment,
            volatilityAdjustment
        );

        const edge = this.calculateEdge(currentPrice, estimatedProbability);
        const confidence = this.calculateConfidence(heuristicAnalysis, newsAnalysis, market, eventInfo, mcpPriceData);

        return this.buildRecommendation({
            currentPrice,
            estimatedProbability,
            edge,
            confidence,
            heuristicAnalysis,
            newsAnalysis,
            eventInfo,
            mcpPriceData
        });
    }

    private extractEventInfo(market: EnrichedMarket): CryptoEventInfo {
        const question = market.question.toLowerCase();
        const description = (market.description || '').toLowerCase();
        const combined = `${question} ${description}`;

        // Определяем тип события
        let type: CryptoEventInfo['type'] = 'other';
        if (combined.includes('price') || combined.includes('reach') || combined.includes('hit') || combined.includes('above') || combined.includes('below')) {
            type = 'price';
        } else if (combined.includes('etf')) {
            type = 'etf';
        } else if (combined.includes('sec') || combined.includes('regulation') || combined.includes('ban') || combined.includes('legal')) {
            type = 'regulation';
        } else if (combined.includes('upgrade') || combined.includes('fork') || combined.includes('merge')) {
            type = 'upgrade';
        } else if (combined.includes('halving')) {
            type = 'halving';
        }

        // Определяем актив
        let asset: string | undefined;
        for (const [keyword, ticker] of Object.entries(CryptoAgent.KNOWN_ASSETS)) {
            if (combined.includes(keyword)) {
                asset = ticker;
                break;
            }
        }

        // Извлекаем ценовую цель
        let priceTarget: number | undefined;
        let direction: 'above' | 'below' | undefined;

        // Паттерны для цены
        const pricePatterns = [
            /\$?([\d,]+)k?/gi,
            /reach\s+\$?([\d,]+)/gi,
            /hit\s+\$?([\d,]+)/gi,
            /above\s+\$?([\d,]+)/gi,
            /below\s+\$?([\d,]+)/gi
        ];

        for (const pattern of pricePatterns) {
            const match = pattern.exec(question);
            if (match && match[1]) {
                let price = parseFloat(match[1].replace(',', ''));
                // Если заканчивается на k - умножаем на 1000
                if (match[0].toLowerCase().includes('k')) {
                    price *= 1000;
                }
                priceTarget = price;
                break;
            }
        }

        if (combined.includes('above') || combined.includes('reach') || combined.includes('hit')) {
            direction = 'above';
        } else if (combined.includes('below') || combined.includes('under')) {
            direction = 'below';
        }

        // Дата
        let deadline: Date | undefined;
        if (market.end_date_iso) {
            deadline = new Date(market.end_date_iso);
        }

        return {
            type,
            asset,
            priceTarget,
            direction,
            deadline
        };
    }

    private analyzeNews(
        news: NewsItem[],
        eventInfo: CryptoEventInfo
    ): { sentiment: number; insights: string; sources: string[] } {
        const sources: string[] = [];
        const insights: string[] = [];
        let sentimentScore = 0;

        const bullishKeywords = ['bullish', 'surge', 'rally', 'buy', 'accumulate', 'institutional', 'adoption', 'approve', 'ath', 'breakout'];
        const bearishKeywords = ['bearish', 'crash', 'dump', 'sell', 'reject', 'ban', 'hack', 'exploit', 'scam', 'fear'];

        for (const article of news) {
            const content = `${article.title} ${article.content || ''}`.toLowerCase();
            sources.push(article.url);

            const bullishCount = bullishKeywords.filter(kw => content.includes(kw)).length;
            const bearishCount = bearishKeywords.filter(kw => content.includes(kw)).length;

            sentimentScore += (bullishCount - bearishCount) * 0.04;

            // ETF новости имеют большой вес
            if (content.includes('etf') && eventInfo.type === 'etf') {
                if (content.includes('approve') || content.includes('approval')) {
                    sentimentScore += 0.1;
                    insights.push(`ETF approval signal: ${article.title}`);
                } else if (content.includes('reject') || content.includes('delay')) {
                    sentimentScore -= 0.1;
                    insights.push(`ETF rejection/delay: ${article.title}`);
                }
            }

            // Регуляторные новости
            if (content.includes('sec') || content.includes('regulation')) {
                insights.push(`Regulatory news: ${article.title}`);
            }

            // Whale movements
            if (content.includes('whale') || content.includes('large transfer')) {
                insights.push(`Whale activity: ${article.title}`);
            }
        }

        return {
            sentiment: Math.max(-0.25, Math.min(0.25, sentimentScore)),
            insights: insights.join('; '),
            sources: sources.slice(0, 5)
        };
    }

    private applyHeuristics(
        market: EnrichedMarket,
        eventInfo: CryptoEventInfo,
        mcpPriceData?: CryptoPriceData | null
    ): { probability: number; factors: string[] } {
        const currentPrice = this.getYesPrice(market);
        // Цена уже проверена в analyze(), но для безопасности:
        if (currentPrice === null) {
            return { probability: 0.5, factors: ['ERROR: No price available'] };
        }
        let adjustedProbability = currentPrice;
        const factors: string[] = [];

        // Ценовые рынки - КЛЮЧЕВАЯ ЛОГИКА с MCP данными
        if (eventInfo.type === 'price' && eventInfo.priceTarget) {
            if (mcpPriceData && mcpPriceData.price > 0) {
                // У нас есть реальная цена из MCP!
                const realPrice = mcpPriceData.price;
                const target = eventInfo.priceTarget;
                const percentToTarget = ((target - realPrice) / realPrice) * 100;

                factors.push(`Current ${eventInfo.asset}: $${realPrice.toLocaleString()}`);
                factors.push(`Target: $${target.toLocaleString()} (${percentToTarget > 0 ? '+' : ''}${percentToTarget.toFixed(1)}%)`);

                if (eventInfo.direction === 'above') {
                    // Цена должна вырасти до target
                    if (realPrice >= target) {
                        // Уже достигли цели!
                        adjustedProbability = 0.95;
                        factors.push('🎯 Target already reached!');
                    } else if (percentToTarget > 50) {
                        // Нужен рост более 50% - маловероятно
                        adjustedProbability = Math.min(currentPrice, 0.3);
                        factors.push('Large gap to target: bearish');
                    } else if (percentToTarget > 20) {
                        // Нужен рост 20-50%
                        adjustedProbability = Math.min(currentPrice * 0.85, 0.5);
                        factors.push('Significant gap to target');
                    } else if (percentToTarget < 5) {
                        // Почти у цели
                        adjustedProbability = Math.max(currentPrice * 1.1, 0.7);
                        factors.push('Close to target: bullish');
                    }
                } else if (eventInfo.direction === 'below') {
                    // Цена должна упасть ниже target
                    if (realPrice <= target) {
                        adjustedProbability = 0.95;
                        factors.push('🎯 Already below target!');
                    } else if (percentToTarget < -30) {
                        adjustedProbability = Math.min(currentPrice, 0.3);
                        factors.push('Large drop needed: bearish outlook');
                    }
                }

                // Учитываем 24h изменение
                if (mcpPriceData.change24h) {
                    const change = mcpPriceData.change24h;
                    if (Math.abs(change) > 5) {
                        factors.push(`24h change: ${change > 0 ? '+' : ''}${change.toFixed(1)}%`);
                        // Сильное движение может продолжиться или откатиться
                        if ((eventInfo.direction === 'above' && change > 5) ||
                            (eventInfo.direction === 'below' && change < -5)) {
                            adjustedProbability *= 1.05; // Momentum
                        }
                    }
                }
            } else {
                // Нет MCP данных - используем базовую логику
                if (eventInfo.direction === 'above' && currentPrice > 0.7) {
                    adjustedProbability = currentPrice * 0.95;
                    factors.push('High probability price target: slight bearish adjustment');
                }
            }
        }

        // ETF события - исторически рынок часто ошибался
        if (eventInfo.type === 'etf') {
            const moveToCenter = (currentPrice - 0.5) * 0.15;
            adjustedProbability -= moveToCenter;
            factors.push('ETF uncertainty adjustment');
        }

        // Регуляторные события - высокая неопределенность
        if (eventInfo.type === 'regulation') {
            const moveToCenter = (currentPrice - 0.5) * 0.1;
            adjustedProbability -= moveToCenter;
            factors.push('Regulatory uncertainty');
        }

        // Halving обычно предсказуем
        if (eventInfo.type === 'halving') {
            factors.push('Halving event (timing predictable)');
        }

        // Близость дедлайна
        if (eventInfo.deadline) {
            const daysToDeadline = (eventInfo.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            if (daysToDeadline < 3 && eventInfo.type === 'price') {
                if (currentPrice > 0.6 && eventInfo.direction === 'above') {
                    adjustedProbability *= 0.9;
                    factors.push('Short timeframe for price movement');
                }
            }
        }

        // Ограничиваем диапазон
        adjustedProbability = Math.max(0.01, Math.min(0.99, adjustedProbability));

        return {
            probability: adjustedProbability,
            factors
        };
    }

    private applyVolatilityAdjustment(
        _eventInfo: CryptoEventInfo,
        currentPrice: number,
        mcpPriceData?: CryptoPriceData | null
    ): number {
        let adjustment = 0;

        // Крипто волатильна - экстремальные вероятности менее надежны
        if (currentPrice > 0.9 || currentPrice < 0.1) {
            adjustment = (0.5 - currentPrice) * 0.05;
        }

        // Если есть MCP данные о 24h изменении - учитываем волатильность
        if (mcpPriceData?.change24h) {
            const absChange = Math.abs(mcpPriceData.change24h);
            if (absChange > 10) {
                // Высокая волатильность - двигаем к центру
                adjustment += (0.5 - currentPrice) * 0.03;
            }
        }

        return adjustment;
    }

    private combineProbabilities(
        marketPrice: number,
        heuristicProbability: number,
        newsSentiment: number,
        volatilityAdjustment: number
    ): number {
        const weights = {
            market: 0.55,
            heuristic: 0.3,
            news: 0.15
        };

        let combined = marketPrice * weights.market +
            heuristicProbability * weights.heuristic +
            (marketPrice + newsSentiment) * weights.news;

        combined += volatilityAdjustment;

        return Math.max(0.01, Math.min(0.99, combined));
    }

    private calculateConfidence(
        heuristicAnalysis: { probability: number; factors: string[] },
        newsAnalysis: { sentiment: number; insights: string; sources: string[] },
        market: EnrichedMarket,
        eventInfo: CryptoEventInfo,
        mcpPriceData?: CryptoPriceData | null
    ): number {
        let confidence = 0.45;

        // Факторы анализа
        confidence += heuristicAnalysis.factors.length * 0.04;

        // Новости
        if (newsAnalysis.sources.length > 0) {
            confidence += Math.min(0.12, newsAnalysis.sources.length * 0.025);
        }

        // Ликвидность
        if (market.liquidityMetrics?.hasLiquidity) {
            confidence += 0.08;
        }

        // MCP данные значительно увеличивают уверенность для ценовых рынков
        if (mcpPriceData && eventInfo.type === 'price') {
            confidence += 0.15; // Реальные данные о цене!
        }

        // Тип события влияет на уверенность
        if (eventInfo.type === 'halving') {
            confidence += 0.1; // Предсказуемое событие
        } else if (eventInfo.type === 'etf' || eventInfo.type === 'regulation') {
            confidence -= 0.05; // Непредсказуемо
        }

        return Math.min(1, Math.max(0, confidence));
    }

    private buildRecommendation(params: {
        currentPrice: number;
        estimatedProbability: number;
        edge: number;
        confidence: number;
        heuristicAnalysis: { probability: number; factors: string[] };
        newsAnalysis: { sentiment: number; insights: string; sources: string[] };
        eventInfo: CryptoEventInfo;
        mcpPriceData?: CryptoPriceData | null;
    }): AgentRecommendation {
        const {
            currentPrice,
            estimatedProbability,
            edge,
            confidence,
            heuristicAnalysis,
            newsAnalysis,
            eventInfo,
            mcpPriceData
        } = params;

        const minEdge = this.cryptoConfig.minEdge || 0.04;

        let action: 'BUY' | 'SELL' | 'SKIP' = 'SKIP';
        if (confidence >= this.config.minConfidence) {
            if (edge > minEdge) {
                action = 'BUY';
            } else if (edge < -minEdge) {
                action = 'SELL';
            }
        }

        const reasoningParts: string[] = [];

        if (eventInfo.asset) {
            reasoningParts.push(`Asset: ${eventInfo.asset}`);
        }
        if (eventInfo.type) {
            reasoningParts.push(`Type: ${eventInfo.type}`);
        }
        if (eventInfo.priceTarget) {
            reasoningParts.push(`Target: $${eventInfo.priceTarget.toLocaleString()}`);
        }

        reasoningParts.push(`Market: ${(currentPrice * 100).toFixed(1)}%`);
        reasoningParts.push(`Estimated: ${(estimatedProbability * 100).toFixed(1)}%`);
        reasoningParts.push(`Edge: ${(edge * 100).toFixed(2)}%`);

        if (heuristicAnalysis.factors.length > 0) {
            reasoningParts.push(`Factors: ${heuristicAnalysis.factors.join(', ')}`);
        }

        return {
            action,
            confidence,
            reasoning: reasoningParts.join(' | '),
            sources: newsAnalysis.sources,
            estimatedProbability,
            edge,
            metadata: {
                eventInfo,
                newsSentiment: newsAnalysis.sentiment,
                mcpData: mcpPriceData ? {
                    realPrice: mcpPriceData.price,
                    change24h: mcpPriceData.change24h,
                    source: 'coingecko'
                } : undefined
            }
        };
    }

    describe(): string {
        return `${super.describe()}
- Min Edge: ${this.cryptoConfig.minEdge}
- Consider Volatility: ${this.cryptoConfig.considerVolatility}`;
    }
}
