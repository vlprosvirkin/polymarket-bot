/**
 * PoliticsAgent - Специализированный агент для анализа политических рынков
 *
 * Особенности:
 * - Анализ выборов (США, другие страны)
 * - Учет опросов и рейтингов
 * - Анализ политических новостей
 * - Исторические паттерны выборов
 *
 * MCP Integration:
 * - tavily/brave-search: Поиск политических новостей и опросов
 * - rss: Получение новостей из политических RSS источников
 * - fetch: Прямой доступ к данным опросов
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
 * Данные опроса
 */
interface PollData {
    candidate: string;
    percentage: number;
    source?: string;
    date?: Date;
}

/**
 * Конфигурация политического агента
 */
export interface PoliticsAgentConfig extends Partial<AgentConfig> {
    /** Минимальный edge для рекомендации */
    minEdge?: number;
    /** Учитывать исторические данные */
    useHistoricalPatterns?: boolean;
}

/**
 * Информация о политическом событии
 */
interface PoliticalEventInfo {
    type?: 'election' | 'policy' | 'nomination' | 'legislation' | 'other';
    country?: string;
    candidates?: string[];
    electionDate?: Date;
    isIncumbent?: boolean;
    party?: string;
}

/**
 * PoliticsAgent - Агент для анализа политических рынков
 */
export class PoliticsAgent extends BaseEventAgent {
    private politicsConfig: PoliticsAgentConfig;

    // Ключевые слова для политических событий
    // ВАЖНО: Избегаем слишком общих слов (vote, win) которые могут матчить спорт/другие категории
    private static readonly POLITICS_KEYWORDS: Record<string, string[]> = {
        usElection: ['trump', 'biden', 'harris', 'presidential election', 'democrat', 'republican', 'gop', 'dnc', 'rnc', 'electoral college', 'swing state', 'primary election', 'caucus'],
        usPolicy: ['congress', 'senate vote', 'house of representatives', 'legislation', 'supreme court', 'scotus', 'federal government', 'executive order', 'veto'],
        international: ['uk election', 'parliament', 'prime minister', 'brexit', 'european union', 'nato summit', 'united nations', 'g7 summit', 'g20'],
        general: ['ballot measure', 'approval rating', 'impeachment', 'resign from office', 'cabinet secretary', 'governor election', 'mayor election']
    };

    // Известные политики
    private static readonly KNOWN_POLITICIANS: Record<string, { party: string; position: string }> = {
        'trump': { party: 'Republican', position: 'Former President' },
        'biden': { party: 'Democrat', position: 'President' },
        'harris': { party: 'Democrat', position: 'Vice President' },
        'desantis': { party: 'Republican', position: 'Governor' },
        'newsom': { party: 'Democrat', position: 'Governor' },
        'pelosi': { party: 'Democrat', position: 'Representative' },
        'mcconnell': { party: 'Republican', position: 'Senator' }
    };

    constructor(config: PoliticsAgentConfig = {}) {
        super({
            name: 'PoliticsAgent',
            minConfidence: config.minConfidence ?? 0.6,
            ...config
        });

        // Валидация minEdge
        if (config.minEdge !== undefined) {
            if (config.minEdge < 0 || config.minEdge > 1) {
                throw new Error(`Invalid minEdge: ${config.minEdge}. Must be between 0 and 1`);
            }
        }

        this.politicsConfig = {
            minEdge: config.minEdge ?? 0.03,
            useHistoricalPatterns: config.useHistoricalPatterns ?? true
        };
    }

    /**
     * Инициализация MCP серверов для политических данных
     * Подключает tavily для новостей и rss для политических источников
     */
    async initializeMCPServers(): Promise<string[]> {
        const connected: string[] = [];

        // Tavily для поиска политических новостей и опросов
        if (process.env.TAVILY_API_KEY) {
            try {
                await this.connectMCP('tavily', 'npx', ['-y', '@anthropic/mcp-server-tavily']);
                connected.push('tavily');
                console.warn(`📡 ${this.config.name}: Connected to Tavily MCP`);
            } catch (error) {
                console.warn(`⚠️ ${this.config.name}: Failed to connect Tavily:`, error);
            }
        }

        // Brave Search как альтернатива
        if (process.env.BRAVE_API_KEY && !connected.includes('tavily')) {
            try {
                await this.connectMCP('brave-search', 'npx', ['-y', '@anthropic/mcp-server-brave-search']);
                connected.push('brave-search');
                console.warn(`📡 ${this.config.name}: Connected to Brave Search MCP`);
            } catch (error) {
                console.warn(`⚠️ ${this.config.name}: Failed to connect Brave Search:`, error);
            }
        }

        // RSS для политических новостей (бесплатный)
        try {
            await this.connectMCP('rss', 'npx', ['-y', '@anthropic/mcp-server-rss']);
            connected.push('rss');
            console.warn(`📡 ${this.config.name}: Connected to RSS MCP`);
        } catch (error) {
            console.warn(`⚠️ ${this.config.name}: Failed to connect RSS:`, error);
        }

        return connected;
    }

    /**
     * Поиск политических новостей через MCP
     */
    async searchPoliticalNews(query: string): Promise<NewsItem[]> {
        // Пробуем Tavily
        if (this.mcpConnected.has('tavily')) {
            try {
                const result = await this.callMCPTool('tavily', 'search', {
                    query: `${query} politics election polls`,
                    max_results: 5,
                    search_depth: 'advanced' // Более глубокий поиск для политики
                });

                return this.parseMCPSearchResult(result);
            } catch (error) {
                console.warn(`⚠️ ${this.config.name}: Failed to search with Tavily:`, error);
            }
        }

        // Пробуем Brave Search
        if (this.mcpConnected.has('brave-search')) {
            try {
                const result = await this.callMCPTool('brave-search', 'brave_search', {
                    query: `${query} politics election`,
                    count: 5
                });

                // Brave использует 'description' вместо 'content'
                return this.parseMCPSearchResult(result, 'description');
            } catch (error) {
                console.warn(`⚠️ ${this.config.name}: Failed to search with Brave:`, error);
            }
        }

        return [];
    }

    /**
     * Поиск данных об опросах через MCP
     */
    async searchPolls(candidate: string): Promise<PollData[]> {
        if (!this.mcpConnected.has('tavily')) {
            return [];
        }

        try {
            const result = await this.callMCPTool('tavily', 'search', {
                query: `${candidate} poll percentage 2024 2025`,
                max_results: 3,
                search_depth: 'basic'
            });

            const newsItems = this.parseMCPSearchResult(result);
            const polls: PollData[] = [];

            for (const item of newsItems) {
                const content = `${item.title} ${item.content || ''}`;

                // Извлекаем проценты из текста
                const percentMatch = content.match(/(\d{1,2})%/g);
                if (percentMatch) {
                    for (const match of percentMatch) {
                        const pct = parseInt(match);
                        if (pct >= 30 && pct <= 70) { // Реалистичные проценты для выборов
                            polls.push({
                                candidate,
                                percentage: pct,
                                source: item.url,
                                date: item.publishedDate ? new Date(item.publishedDate) : undefined
                            });
                            break;
                        }
                    }
                }
            }

            return polls;
        } catch (error) {
            console.warn(`⚠️ ${this.config.name}: Failed to search polls:`, error);
        }

        return [];
    }

    getCategory(): string {
        return 'politics';
    }

    getKeywords(): string[] {
        const allKeywords: string[] = [];
        for (const keywords of Object.values(PoliticsAgent.POLITICS_KEYWORDS)) {
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

        // 2. Получаем данные опросов через MCP если это выборы
        const mcpPollData: PollData[] = [];
        if (eventInfo.type === 'election' && eventInfo.candidates && eventInfo.candidates.length > 0) {
            for (const candidate of eventInfo.candidates.slice(0, 2)) { // Максимум 2 кандидата
                const polls = await this.searchPolls(candidate);
                if (polls.length > 0) {
                    mcpPollData.push(...polls);
                    console.warn(`📊 ${this.config.name}: Got poll data for ${candidate}: ${polls[0]?.percentage}%`);
                }
            }
        }

        // 3. Анализируем новости (из контекста или через MCP)
        let newsAnalysis = { sentiment: 0, insights: '', sources: [] as string[] };
        if (context?.recentNews && context.recentNews.length > 0) {
            newsAnalysis = this.analyzeNews(context.recentNews, eventInfo);
        } else {
            // Пробуем получить новости через MCP
            const query = eventInfo.candidates && eventInfo.candidates.length > 0
                ? eventInfo.candidates.join(' ')
                : market.question;
            const mcpNews = await this.searchPoliticalNews(query);
            if (mcpNews.length > 0) {
                newsAnalysis = this.analyzeNews(mcpNews, eventInfo);
                console.warn(`📰 ${this.config.name}: Got ${mcpNews.length} news items from MCP`);
            }
        }

        // 4. Применяем политические эвристики (с MCP данными)
        const heuristicAnalysis = this.applyHeuristics(market, eventInfo, mcpPollData);

        // 5. Учитываем исторические паттерны
        const historicalAdjustment = this.politicsConfig.useHistoricalPatterns
            ? this.applyHistoricalPatterns(eventInfo, currentPrice)
            : 0;

        // 6. Комбинируем анализ
        const estimatedProbability = this.combineProbabilities(
            currentPrice,
            heuristicAnalysis.probability,
            newsAnalysis.sentiment,
            historicalAdjustment
        );

        const edge = this.calculateEdge(currentPrice, estimatedProbability);
        const confidence = this.calculateConfidence(heuristicAnalysis, newsAnalysis, market, mcpPollData);

        return this.buildRecommendation({
            currentPrice,
            estimatedProbability,
            edge,
            confidence,
            heuristicAnalysis,
            newsAnalysis,
            eventInfo,
            mcpPollData
        });
    }

    private extractEventInfo(market: EnrichedMarket): PoliticalEventInfo {
        const question = market.question.toLowerCase();
        const description = (market.description || '').toLowerCase();
        const combined = `${question} ${description}`;

        // Определяем тип события
        let type: PoliticalEventInfo['type'] = 'other';
        if (combined.includes('election') || combined.includes('win') || combined.includes('vote')) {
            type = 'election';
        } else if (combined.includes('bill') || combined.includes('pass') || combined.includes('legislation')) {
            type = 'legislation';
        } else if (combined.includes('nominate') || combined.includes('nomination')) {
            type = 'nomination';
        } else if (combined.includes('policy') || combined.includes('executive order')) {
            type = 'policy';
        }

        // Определяем страну
        let country = 'USA';
        if (combined.includes('uk') || combined.includes('britain') || combined.includes('parliament')) {
            country = 'UK';
        } else if (combined.includes('europe') || combined.includes('eu ')) {
            country = 'EU';
        }

        // Находим кандидатов
        const candidates: string[] = [];
        for (const politician of Object.keys(PoliticsAgent.KNOWN_POLITICIANS)) {
            if (combined.includes(politician)) {
                candidates.push(politician);
            }
        }

        // Проверяем инкумбента
        const isIncumbent = combined.includes('incumbent') ||
            combined.includes('re-elect') ||
            combined.includes('reelect');

        // Дата события
        let electionDate: Date | undefined;
        if (market.end_date_iso) {
            electionDate = new Date(market.end_date_iso);
        }

        return {
            type,
            country,
            candidates,
            electionDate,
            isIncumbent
        };
    }

    private analyzeNews(
        news: NewsItem[],
        _eventInfo: PoliticalEventInfo
    ): { sentiment: number; insights: string; sources: string[] } {
        const sources: string[] = [];
        const insights: string[] = [];
        let sentimentScore = 0;

        const positiveKeywords = ['lead', 'ahead', 'surge', 'win', 'victory', 'support', 'endorse', 'popular'];
        const negativeKeywords = ['trail', 'behind', 'scandal', 'controversy', 'decline', 'lose', 'unpopular', 'criticism'];

        for (const article of news) {
            const content = `${article.title} ${article.content || ''}`.toLowerCase();
            sources.push(article.url);

            const positiveCount = positiveKeywords.filter(kw => content.includes(kw)).length;
            const negativeCount = negativeKeywords.filter(kw => content.includes(kw)).length;

            sentimentScore += (positiveCount - negativeCount) * 0.05;

            // Проверяем опросы
            if (content.includes('poll') || content.includes('survey')) {
                insights.push(`Poll mentioned: ${article.title}`);
                // Пытаемся извлечь числа из заголовка
                const numbers = article.title.match(/\d+%?/g);
                if (numbers) {
                    insights.push(`Numbers: ${numbers.join(', ')}`);
                }
            }

            // Проверяем endorsements
            if (content.includes('endorse')) {
                insights.push(`Endorsement: ${article.title}`);
                sentimentScore += 0.02;
            }
        }

        return {
            sentiment: Math.max(-0.2, Math.min(0.2, sentimentScore)),
            insights: insights.join('; '),
            sources: sources.slice(0, 5)
        };
    }

    private applyHeuristics(
        market: EnrichedMarket,
        eventInfo: PoliticalEventInfo,
        mcpPollData?: PollData[]
    ): { probability: number; factors: string[] } {
        const currentPrice = this.getYesPrice(market);
        // Цена уже проверена в analyze(), но для безопасности:
        if (currentPrice === null) {
            return { probability: 0.5, factors: ['ERROR: No price available'] };
        }
        let adjustedProbability = currentPrice;
        const factors: string[] = [];

        // Используем MCP данные опросов если есть
        if (mcpPollData && mcpPollData.length > 0) {
            // Группируем опросы по кандидатам
            const pollsByCandidate: Record<string, number[]> = {};
            for (const poll of mcpPollData) {
                const candidateName = poll.candidate;
                if (!pollsByCandidate[candidateName]) {
                    pollsByCandidate[candidateName] = [];
                }
                pollsByCandidate[candidateName].push(poll.percentage);
            }

            // Считаем среднее для каждого кандидата
            for (const [candidate, percentages] of Object.entries(pollsByCandidate)) {
                const avg = percentages.reduce((a, b) => a + b, 0) / percentages.length;
                factors.push(`MCP Poll: ${candidate} ${avg.toFixed(0)}%`);
            }

            // Если есть два кандидата - можем оценить вероятность
            const candidateKeys = Object.keys(pollsByCandidate);
            if (candidateKeys.length === 2) {
                const key1 = candidateKeys[0] as string;
                const key2 = candidateKeys[1] as string;
                const polls1 = pollsByCandidate[key1];
                const polls2 = pollsByCandidate[key2];
                if (polls1 && polls2) {
                    const avg1 = polls1.reduce((a: number, b: number) => a + b, 0) / polls1.length;
                    const avg2 = polls2.reduce((a: number, b: number) => a + b, 0) / polls2.length;
                    const pollProbability = avg1 / (avg1 + avg2);

                    // Корректируем на основе опросов (но не слишком сильно - опросы часто ошибаются)
                    if (Math.abs(currentPrice - pollProbability) > 0.1) {
                        adjustedProbability = currentPrice * 0.7 + pollProbability * 0.3;
                        factors.push('Adjusted based on MCP polls');
                    }
                }
            }
        }

        // Инкумбенты имеют преимущество
        if (eventInfo.isIncumbent && currentPrice > 0.4) {
            adjustedProbability += 0.02;
            factors.push('Incumbent advantage');
        }

        // Очень высокие вероятности в политике часто переоценены
        if (currentPrice > 0.85) {
            adjustedProbability = currentPrice * 0.97;
            factors.push('High probability adjustment: political uncertainty');
        }

        // Близость к выборам увеличивает неопределенность
        if (eventInfo.electionDate) {
            const daysToElection = (eventInfo.electionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            if (daysToElection < 7) {
                const moveToCenter = (currentPrice - 0.5) * 0.05;
                adjustedProbability -= moveToCenter;
                factors.push('Pre-election uncertainty adjustment');
            }
        }

        // Ограничиваем диапазон
        adjustedProbability = Math.max(0.01, Math.min(0.99, adjustedProbability));

        return {
            probability: adjustedProbability,
            factors
        };
    }

    private applyHistoricalPatterns(eventInfo: PoliticalEventInfo, _currentPrice: number): number {
        // Исторические паттерны для выборов
        if (eventInfo.type === 'election' && eventInfo.country === 'USA') {
            // Исторически опросы немного недооценивают Republican кандидатов
            // Это спорный паттерн, применяем очень малый adjustment
            return 0;
        }
        return 0;
    }

    private combineProbabilities(
        marketPrice: number,
        heuristicProbability: number,
        newsSentiment: number,
        historicalAdjustment: number
    ): number {
        const weights = {
            market: 0.6,
            heuristic: 0.3,
            news: 0.1
        };

        let combined = marketPrice * weights.market +
            heuristicProbability * weights.heuristic +
            (marketPrice + newsSentiment) * weights.news;

        combined += historicalAdjustment;

        return Math.max(0.01, Math.min(0.99, combined));
    }

    private calculateConfidence(
        heuristicAnalysis: { probability: number; factors: string[] },
        newsAnalysis: { sentiment: number; insights: string; sources: string[] },
        market: EnrichedMarket,
        mcpPollData?: PollData[]
    ): number {
        let confidence = 0.5;

        confidence += heuristicAnalysis.factors.length * 0.05;

        if (newsAnalysis.sources.length > 0) {
            confidence += Math.min(0.15, newsAnalysis.sources.length * 0.03);
        }

        // MCP данные опросов увеличивают уверенность
        if (mcpPollData && mcpPollData.length > 0) {
            confidence += 0.1;
            // Если есть данные от нескольких источников - еще лучше
            const uniqueSources = new Set(mcpPollData.map(p => p.source).filter(Boolean));
            if (uniqueSources.size > 1) {
                confidence += 0.05;
            }
        }

        if (market.liquidityMetrics?.hasLiquidity) {
            confidence += 0.1;
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
        eventInfo: PoliticalEventInfo;
        mcpPollData?: PollData[];
    }): AgentRecommendation {
        const {
            currentPrice,
            estimatedProbability,
            edge,
            confidence,
            heuristicAnalysis,
            newsAnalysis,
            eventInfo,
            mcpPollData
        } = params;

        const minEdge = this.politicsConfig.minEdge || 0.03;

        let action: 'BUY' | 'SELL' | 'SKIP' = 'SKIP';
        if (confidence >= this.config.minConfidence) {
            if (edge > minEdge) {
                action = 'BUY';
            } else if (edge < -minEdge) {
                action = 'SELL';
            }
        }

        const reasoningParts: string[] = [];

        if (eventInfo.type) {
            reasoningParts.push(`Type: ${eventInfo.type}`);
        }
        if (eventInfo.country) {
            reasoningParts.push(`Country: ${eventInfo.country}`);
        }
        if (eventInfo.candidates && eventInfo.candidates.length > 0) {
            reasoningParts.push(`Candidates: ${eventInfo.candidates.join(', ')}`);
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
                mcpData: mcpPollData && mcpPollData.length > 0 ? {
                    pollCount: mcpPollData.length,
                    polls: mcpPollData.map(p => ({ candidate: p.candidate, percentage: p.percentage })),
                    source: 'tavily'
                } : undefined
            }
        };
    }

    describe(): string {
        return `${super.describe()}
- Min Edge: ${this.politicsConfig.minEdge}
- Use Historical Patterns: ${this.politicsConfig.useHistoricalPatterns}`;
    }
}
