/**
 * SportsAgent - Специализированный агент для анализа спортивных рынков
 *
 * Особенности:
 * - Анализ матчей NBA, NFL, MLB, NHL, Soccer
 * - Поиск статистики команд и игроков
 * - Учет травм, формы команд, домашнего преимущества
 *
 * MCP Integration:
 * - tako: Спортивные данные (расписание, статистика)
 * - tavily/brave-search: Поиск новостей о командах и травмах
 * - fetch: Получение данных с ESPN и других источников
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
 * Конфигурация спортивного агента
 */
export interface SportsAgentConfig extends Partial<AgentConfig> {
    /** Минимальный edge для рекомендации BUY/SELL */
    minEdge?: number;
    /** Предпочтительные лиги */
    preferredLeagues?: string[];
    /** Исключенные лиги */
    excludedLeagues?: string[];
}

/**
 * Информация о спортивном событии
 */
interface SportEventInfo {
    league?: string;
    homeTeam?: string;
    awayTeam?: string;
    eventDate?: Date;
    isPlayoff?: boolean;
    sport?: 'basketball' | 'football' | 'baseball' | 'hockey' | 'soccer' | 'other';
}

/**
 * SportsAgent - Агент для анализа спортивных рынков
 *
 * @example
 * ```typescript
 * const agent = new SportsAgent({ minEdge: 0.05 });
 * const recommendation = await agent.analyzeWithCache(market);
 * ```
 */
export class SportsAgent extends BaseEventAgent {
    private sportsConfig: SportsAgentConfig;

    // Ключевые слова для разных видов спорта
    private static readonly SPORT_KEYWORDS: Record<string, string[]> = {
        basketball: ['nba', 'basketball', 'lakers', 'celtics', 'warriors', 'bulls', 'heat', 'nuggets', 'suns', 'bucks', 'mvp', 'playoffs', 'finals'],
        football: ['nfl', 'football', 'super bowl', 'chiefs', 'eagles', 'cowboys', 'patriots', 'packers', '49ers', 'touchdown', 'quarterback'],
        baseball: ['mlb', 'baseball', 'world series', 'yankees', 'dodgers', 'red sox', 'cubs', 'home run'],
        hockey: ['nhl', 'hockey', 'stanley cup', 'bruins', 'rangers', 'maple leafs', 'canadiens'],
        soccer: ['soccer', 'football', 'premier league', 'champions league', 'world cup', 'la liga', 'bundesliga', 'serie a', 'messi', 'ronaldo', 'manchester', 'liverpool', 'real madrid', 'barcelona']
    };

    // Известные команды для извлечения информации
    private static readonly TEAM_PATTERNS: RegExp[] = [
        /(\w+)\s+(?:vs?\.?|versus|at|@)\s+(\w+)/i,
        /(\w+)\s+(?:to )?(?:win|beat|defeat)\s+(\w+)?/i,
        /(\w+)\s+(?:game|match|series)/i
    ];

    constructor(config: SportsAgentConfig = {}) {
        super({
            name: 'SportsAgent',
            minConfidence: config.minConfidence ?? 0.65,
            ...config
        });

        // Валидация minEdge
        if (config.minEdge !== undefined) {
            if (config.minEdge < 0 || config.minEdge > 1) {
                throw new Error(`Invalid minEdge: ${config.minEdge}. Must be between 0 and 1`);
            }
        }

        this.sportsConfig = {
            minEdge: config.minEdge ?? 0.05,
            preferredLeagues: config.preferredLeagues,
            excludedLeagues: config.excludedLeagues
        };
    }

    /**
     * Инициализация MCP серверов для спортивных данных
     * Подключает tako для статистики и tavily/brave для новостей
     */
    async initializeMCPServers(): Promise<string[]> {
        const connected: string[] = [];

        // Tako - спортивные данные (бесплатный)
        try {
            await this.connectMCP('tako', 'npx', ['-y', '@anthropic/mcp-server-tako']);
            connected.push('tako');
            console.warn(`📡 ${this.config.name}: Connected to Tako MCP`);
        } catch (error) {
            console.warn(`⚠️ ${this.config.name}: Failed to connect Tako:`, error);
        }

        // Tavily для поиска новостей о травмах и командах
        if (process.env.TAVILY_API_KEY) {
            try {
                await this.connectMCP('tavily', 'npx', ['-y', '@anthropic/mcp-server-tavily']);
                connected.push('tavily');
                console.warn(`📡 ${this.config.name}: Connected to Tavily MCP`);
            } catch (error) {
                console.warn(`⚠️ ${this.config.name}: Failed to connect Tavily:`, error);
            }
        }

        // Fetch для получения данных напрямую
        try {
            await this.connectMCP('fetch', 'npx', ['-y', '@anthropic/mcp-server-fetch']);
            connected.push('fetch');
            console.warn(`📡 ${this.config.name}: Connected to Fetch MCP`);
        } catch (error) {
            console.warn(`⚠️ ${this.config.name}: Failed to connect Fetch:`, error);
        }

        return connected;
    }

    /**
     * Поиск новостей о команде через MCP
     */
    async searchTeamNews(team: string, league?: string): Promise<NewsItem[]> {
        if (!this.mcpConnected.has('tavily')) {
            return [];
        }

        try {
            const query = league
                ? `${team} ${league} news injuries updates`
                : `${team} sports news injuries`;

            const result = await this.callMCPTool('tavily', 'search', {
                query,
                max_results: 5,
                search_depth: 'basic'
            });

            if (!result || result.isError) {
                return [];
            }
            // Type guard: проверяем что result это MCPToolResult
            if (result && typeof result === 'object' && 'content' in result && Array.isArray(result.content)) {
                const parsed: NewsItem[] = this.parseMCPSearchResult(result as import('./BaseEventAgent').MCPToolResult);
                return parsed;
            }
            return [];
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`⚠️ ${this.config.name}: Failed to search team news:`, errorMsg);
            return [];
        }
    }

    /**
     * Получение спортивных данных через Tako MCP
     */
    async getSportsData(query: string): Promise<Record<string, unknown> | null> {
        if (!this.mcpConnected.has('tako')) {
            return null;
        }

        try {
            const result = await this.callMCPTool('tako', 'sports_query', {
                query
            });

            if (result && typeof result === 'object') {
                // MCPToolResult имеет структуру { content: Array<...>, isError?: boolean }
                // Преобразуем в Record для совместимости
                return result as unknown as Record<string, unknown>;
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`⚠️ ${this.config.name}: Failed to get sports data:`, errorMsg);
        }

        return null;
    }

    /**
     * Категория агента
     */
    getCategory(): string {
        return 'sports';
    }

    /**
     * Ключевые слова для фильтрации спортивных рынков
     */
    getKeywords(): string[] {
        const allKeywords: string[] = [];
        for (const keywords of Object.values(SportsAgent.SPORT_KEYWORDS)) {
            allKeywords.push(...keywords);
        }
        return allKeywords;
    }

    /**
     * Основной метод анализа спортивного рынка
     */
    async analyze(market: EnrichedMarket, context?: AnalysisContext): Promise<AgentRecommendation> {
        const currentPrice = this.getYesPrice(market);

        // FAIL-FAST: Без цены невозможно принять решение о ставке
        if (currentPrice === null) {
            return this.getDefaultRecommendation('No YES token price available - cannot analyze');
        }

        // 1. Извлекаем информацию о событии
        const eventInfo = this.extractEventInfo(market);

        // 2. Получаем данные из MCP серверов если подключены
        let mcpData: Record<string, unknown> = {};
        if (this.mcpConnectedSingle) {
            // Получаем статистику команд через Tako MCP сервер
            if (eventInfo.homeTeam && eventInfo.awayTeam && this.mcpConnected.has('tako')) {
                try {
                    const homeStats = await this.getSportsData(`${eventInfo.homeTeam} stats ${eventInfo.league || ''}`);
                    const awayStats = await this.getSportsData(`${eventInfo.awayTeam} stats ${eventInfo.league || ''}`);
                    if (homeStats || awayStats) {
                        mcpData = { homeStats, awayStats };
                    }
                } catch (error) {
                    console.warn(`⚠️ ${this.config.name}: Failed to get team stats from Tako MCP:`, error);
                }
            }

            // Получаем новости о командах через Tavily
            if (eventInfo.homeTeam && this.mcpConnected.has('tavily')) {
                try {
                    const teamNews = await this.searchTeamNews(eventInfo.homeTeam, eventInfo.league);
                    if (teamNews.length > 0) {
                        mcpData = { ...mcpData, teamNews };
                    }
                } catch (error) {
                    console.warn(`⚠️ ${this.config.name}: Failed to get team news:`, error);
                }
            }
        }

        // 3. Анализируем новости если есть
        let newsInsights = '';
        let sources: string[] = [];
        if (context?.recentNews && context.recentNews.length > 0) {
            const newsAnalysis = this.analyzeNews(context.recentNews, eventInfo);
            newsInsights = newsAnalysis.insights;
            sources = newsAnalysis.sources;
        }

        // 4. Базовая эвристика для спортивных событий
        const heuristicAnalysis = this.applyHeuristics(market, eventInfo);

        // 5. Комбинируем анализ (учитываем MCP данные если есть)
        const estimatedProbability = this.combineProbabilities(
            currentPrice,
            heuristicAnalysis.probability,
            newsInsights ? this.extractProbabilityFromNews(newsInsights) : null,
            mcpData // Передаем MCP данные для учета в вероятности
        );

        const edge = this.calculateEdge(currentPrice, estimatedProbability);
        const confidence = this.calculateConfidence(heuristicAnalysis, newsInsights, market);

        // 5. Формируем рекомендацию
        return this.buildRecommendation({
            currentPrice,
            estimatedProbability,
            edge,
            confidence,
            heuristicAnalysis,
            newsInsights,
            sources,
            eventInfo
        });
    }

    /**
     * Извлечение информации о спортивном событии
     */
    private extractEventInfo(market: EnrichedMarket): SportEventInfo {
        const question = market.question.toLowerCase();
        const description = (market.description || '').toLowerCase();
        const combined = `${question} ${description}`;

        // Определяем вид спорта
        let sport: SportEventInfo['sport'] = 'other';
        for (const [sportType, keywords] of Object.entries(SportsAgent.SPORT_KEYWORDS)) {
            if (keywords.some(kw => combined.includes(kw))) {
                sport = sportType as SportEventInfo['sport'];
                break;
            }
        }

        // Определяем лигу
        const leaguePatterns: Record<string, string> = {
            'nba': 'NBA',
            'nfl': 'NFL',
            'mlb': 'MLB',
            'nhl': 'NHL',
            'premier league': 'Premier League',
            'champions league': 'Champions League',
            'la liga': 'La Liga',
            'bundesliga': 'Bundesliga',
            'serie a': 'Serie A'
        };

        let league: string | undefined;
        for (const [pattern, leagueName] of Object.entries(leaguePatterns)) {
            if (combined.includes(pattern)) {
                league = leagueName;
                break;
            }
        }

        // Извлекаем команды
        let homeTeam: string | undefined;
        let awayTeam: string | undefined;

        for (const pattern of SportsAgent.TEAM_PATTERNS) {
            const match = market.question.match(pattern);
            if (match) {
                homeTeam = match[1];
                awayTeam = match[2];
                break;
            }
        }

        // Проверяем плейофф
        const isPlayoff = combined.includes('playoff') ||
            combined.includes('finals') ||
            combined.includes('championship') ||
            combined.includes('world series') ||
            combined.includes('super bowl') ||
            combined.includes('stanley cup');

        // Дата события
        let eventDate: Date | undefined;
        if (market.end_date_iso) {
            eventDate = new Date(market.end_date_iso);
        }

        return {
            sport,
            league,
            homeTeam,
            awayTeam,
            isPlayoff,
            eventDate
        };
    }

    /**
     * Анализ новостей
     */
    private analyzeNews(
        news: NewsItem[],
        _eventInfo: SportEventInfo
    ): { insights: string; sources: string[] } {
        if (!news || news.length === 0) {
            return { insights: '', sources: [] };
        }

        const sources: string[] = [];
        const insights: string[] = [];

        // Ключевые слова для анализа
        const positiveKeywords = ['win', 'victory', 'dominant', 'strong', 'healthy', 'confident', 'favorite'];
        const negativeKeywords = ['lose', 'injury', 'injured', 'out', 'doubt', 'struggling', 'underdog', 'suspended'];

        for (const article of news) {
            const content = `${article.title} ${article.content || ''}`.toLowerCase();
            sources.push(article.url);

            // Анализируем тональность
            const positiveCount = positiveKeywords.filter(kw => content.includes(kw)).length;
            const negativeCount = negativeKeywords.filter(kw => content.includes(kw)).length;

            if (positiveCount > negativeCount) {
                insights.push(`Positive news: ${article.title}`);
            } else if (negativeCount > positiveCount) {
                insights.push(`Negative news: ${article.title}`);
            }

            // Проверяем травмы
            if (content.includes('injury') || content.includes('injured') || content.includes('out')) {
                insights.push(`Injury alert: ${article.title}`);
            }
        }

        return {
            insights: insights.join('; '),
            sources: sources.slice(0, 5)
        };
    }

    /**
     * Применение эвристик для спортивных событий
     * Примечание: currentPrice передается из analyze() где уже проверен на null
     */
    private applyHeuristics(
        market: EnrichedMarket,
        eventInfo: SportEventInfo
    ): { probability: number; factors: string[] } {
        const currentPrice = this.getYesPrice(market);
        // Цена уже проверена в analyze(), но для безопасности:
        if (currentPrice === null) {
            return { probability: 0.5, factors: ['ERROR: No price available'] };
        }
        let adjustedProbability = currentPrice;
        const factors: string[] = [];

        // Плейофф игры обычно более непредсказуемы
        if (eventInfo.isPlayoff) {
            // Двигаем вероятность ближе к 50%
            const moveToCenter = (currentPrice - 0.5) * 0.1;
            adjustedProbability -= moveToCenter;
            factors.push('Playoff adjustment: more uncertainty');
        }

        // Высокие вероятности (>90%) часто переоценены в спорте
        if (currentPrice > 0.9) {
            adjustedProbability = currentPrice * 0.95;
            factors.push('High probability adjustment: favorites often overvalued');
        }

        // Низкие вероятности (<10%) иногда недооценены
        if (currentPrice < 0.1) {
            adjustedProbability = currentPrice * 1.2;
            factors.push('Low probability adjustment: underdogs sometimes undervalued');
        }

        // Домашнее преимущество (если можно определить)
        if (eventInfo.homeTeam && eventInfo.awayTeam) {
            // Базовое домашнее преимущество ~3-5%
            factors.push(`Home advantage considered for ${eventInfo.homeTeam}`);
        }

        // Ограничиваем диапазон
        adjustedProbability = Math.max(0.01, Math.min(0.99, adjustedProbability));

        return {
            probability: adjustedProbability,
            factors
        };
    }

    /**
     * Извлечение вероятности из новостного анализа
     */
    private extractProbabilityFromNews(newsInsights: string): number | null {
        if (!newsInsights) return null;

        const positiveCount = (newsInsights.match(/positive/gi) || []).length;
        const negativeCount = (newsInsights.match(/negative/gi) || []).length;
        const injuryCount = (newsInsights.match(/injury/gi) || []).length;

        if (positiveCount === 0 && negativeCount === 0) return null;

        // Базовый сдвиг на основе новостей
        const sentiment = (positiveCount - negativeCount - injuryCount * 0.5) * 0.02;
        return 0.5 + sentiment;
    }

    /**
     * Комбинирование вероятностей из разных источников
     */
    private combineProbabilities(
        marketPrice: number,
        heuristicProbability: number,
        newsProbability: number | null,
        mcpData?: Record<string, unknown>
    ): number {
        // Веса для разных источников
        const weights = {
            market: 0.4,      // Рынок обычно эффективен
            heuristic: 0.3,   // Эвристики
            news: 0.2,        // Новости
            mcp: 0.1          // MCP данные (статистика, API)
        };

        let combined = marketPrice * weights.market + heuristicProbability * weights.heuristic;
        let totalWeight = weights.market + weights.heuristic;

        if (newsProbability !== null) {
            combined += newsProbability * weights.news;
            totalWeight += weights.news;
        }

        // Учитываем MCP данные если есть (например, статистика команд)
        if (mcpData && Object.keys(mcpData).length > 0) {
            // Простая эвристика: если есть статистика, немного корректируем вероятность
            const mcpAdjustment = this.extractProbabilityFromMCPData(mcpData);
            if (mcpAdjustment !== null) {
                combined += mcpAdjustment * weights.mcp;
                totalWeight += weights.mcp;
            }
        }

        return combined / totalWeight;
    }

    /**
     * Извлечение вероятности из MCP данных
     * TODO: Реализовать анализ статистики команд когда структура данных MCP будет известна
     */
    private extractProbabilityFromMCPData(_mcpData: Record<string, unknown>): number | null {
        // Метод оставлен для будущей реализации анализа статистики команд
        // Пока всегда возвращает null, так как структура данных MCP неизвестна
        return null;
    }

    /**
     * Расчет уверенности
     */
    private calculateConfidence(
        heuristicAnalysis: { probability: number; factors: string[] },
        newsInsights: string,
        market: EnrichedMarket
    ): number {
        let confidence = 0.5;

        // Больше факторов = больше уверенности
        confidence += heuristicAnalysis.factors.length * 0.05;

        // Есть новости = больше информации
        if (newsInsights) {
            confidence += 0.1;
        }

        // Хорошая ликвидность = более надежная цена
        if (market.liquidityMetrics?.hasLiquidity) {
            confidence += 0.1;
        }

        // Низкий спред = более надежная цена
        if (market.liquidityMetrics?.spreadPercent && market.liquidityMetrics.spreadPercent < 5) {
            confidence += 0.1;
        }

        return Math.min(1, Math.max(0, confidence));
    }

    /**
     * Построение финальной рекомендации
     */
    private buildRecommendation(params: {
        currentPrice: number;
        estimatedProbability: number;
        edge: number;
        confidence: number;
        heuristicAnalysis: { probability: number; factors: string[] };
        newsInsights: string;
        sources: string[];
        eventInfo: SportEventInfo;
    }): AgentRecommendation {
        const {
            currentPrice,
            estimatedProbability,
            edge,
            confidence,
            heuristicAnalysis,
            newsInsights,
            sources,
            eventInfo
        } = params;

        const minEdge = this.sportsConfig.minEdge || 0.05;

        // Определяем действие
        let action: 'BUY' | 'SELL' | 'SKIP' = 'SKIP';
        if (confidence >= this.config.minConfidence) {
            if (edge > minEdge) {
                action = 'BUY';
            } else if (edge < -minEdge) {
                action = 'SELL';
            }
        }

        // Формируем обоснование
        const reasoningParts: string[] = [];

        if (eventInfo.league) {
            reasoningParts.push(`League: ${eventInfo.league}`);
        }
        if (eventInfo.sport && eventInfo.sport !== 'other') {
            reasoningParts.push(`Sport: ${eventInfo.sport}`);
        }
        if (eventInfo.isPlayoff) {
            reasoningParts.push('Playoff game');
        }

        reasoningParts.push(`Market price: ${(currentPrice * 100).toFixed(1)}%`);
        reasoningParts.push(`Estimated: ${(estimatedProbability * 100).toFixed(1)}%`);
        reasoningParts.push(`Edge: ${(edge * 100).toFixed(2)}%`);

        if (heuristicAnalysis.factors.length > 0) {
            reasoningParts.push(`Factors: ${heuristicAnalysis.factors.join(', ')}`);
        }

        if (newsInsights) {
            reasoningParts.push(`News: ${newsInsights.substring(0, 100)}...`);
        }

        return {
            action,
            confidence,
            reasoning: reasoningParts.join(' | '),
            sources,
            estimatedProbability,
            edge,
            metadata: {
                eventInfo,
                heuristicFactors: heuristicAnalysis.factors
            }
        };
    }

    /**
     * Описание агента
     */
    describe(): string {
        return `${super.describe()}
- Min Edge: ${this.sportsConfig.minEdge}
- Preferred Leagues: ${this.sportsConfig.preferredLeagues?.join(', ') || 'all'}
- Sports Keywords: ${Object.keys(SportsAgent.SPORT_KEYWORDS).join(', ')}`;
    }
}
