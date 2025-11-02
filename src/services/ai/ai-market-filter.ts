/**
 * AI Market Filter - вдохновлен подходом Poly-Trader
 * Использует AI для анализа рынков и выбора лучших для торговли
 * 
 * Основная идея: AI анализирует каждый рынок детально и решает,
 * стоит ли на нем торговать, основываясь на множестве факторов
 * 
 * Интегрирован с SerpAPI для получения свежих новостей о событиях
 */

import type { Market } from '../../types/market';
import { AIService } from './ai.service';
import { SerpAPIService } from '../serpapi.service';
import { TavilyService } from '../tavily.service';
import { AI_STRATEGY_CONFIG } from '../../core/config';

export interface MarketAnalysis {
    shouldTrade: boolean;        // Стоит ли торговать на этом рынке
    confidence: number;          // Уверенность в решении (0-1)
    reasoning: string;           // Детальное обоснование
    attractiveness: number;      // Общая привлекательность (0-1)
    estimatedProbability?: number; // Оценка вероятности события от AI (0-1), для поиска edge
    riskLevel: 'low' | 'medium' | 'high';
    riskFactors: string[];       // Конкретные риски
    opportunities: string[];     // Выявленные возможности
    recommendedAction?: 'BUY_YES' | 'BUY_NO' | 'AVOID';
}

export interface FilterContext {
    strategyType?: 'endgame' | 'high-confidence' | 'market-making';
    minAttractiveness?: number;  // Минимальная привлекательность (0-1)
    maxRisk?: 'low' | 'medium' | 'high';
    preferredCategories?: string[];
    excludedCategories?: string[];
}

export class AIMarketFilter {
    private aiService: AIService;
    private serpApiService: SerpAPIService | null = null;
    private tavilyService: TavilyService | null = null;
    private useNews: boolean = false;

    constructor(useNews: boolean = false) {
        this.useNews = useNews;
        
        // Инициализируем SerpAPI только если включено и ключ есть
        if (useNews && process.env.SERP_API_KEY) {
            try {
                this.serpApiService = new SerpAPIService();
                console.log('✅ SerpAPI service initialized (news enabled)');
            } catch (error) {
                console.warn('⚠️  SerpAPI initialization failed, continuing without news:', error);
                this.useNews = false;
            }
        }

        // Инициализируем Tavily для глубокого анализа (если ключ есть)
        if (AI_STRATEGY_CONFIG.USE_TAVILY_FOR_TOP_MARKETS && process.env.TAVILY_API_KEY) {
            try {
                this.tavilyService = new TavilyService();
                console.log('✅ Tavily service initialized (deep analysis enabled)');
            } catch (error) {
                console.warn('⚠️  Tavily initialization failed, continuing without deep analysis:', error);
            }
        }
        const systemPrompt = `You are an expert prediction market analyst, similar to the approach used in Poly-Trader.

Your task is to analyze Polymarket prediction markets and determine whether they are suitable for trading.

**Your Analysis Should Consider:**

1. **Market Quality:**
   - Is the question clear and unambiguous?
   - Are resolution criteria well-defined?
   - Is there a clear date/time for resolution?
   - Has this type of market been resolved correctly in the past?

2. **Market Efficiency:**
   - Does the current price seem reasonable?
   - Is there potential mispricing or inefficiency?
   - What does market sentiment suggest?
   - Are there arbitrage opportunities?

3. **Risk Assessment:**
   - What are the main risk factors?
   - Is there manipulation potential?
   - How volatile might this market be?
   - What could go wrong with resolution?

4. **Opportunities:**
   - What makes this market attractive?
   - Are there clear signals suggesting direction?
   - Is there sufficient information to make a decision?
   - Timing considerations

5. **Context & Strategy Fit:**
   - Does this market fit the trading strategy?
   - Is it appropriate for the risk tolerance?
   - Category-specific considerations

**Output Format (JSON):**
{
  "shouldTrade": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Detailed explanation of your analysis",
  "attractiveness": 0.0-1.0,
  "estimatedProbability": 0.0-1.0,  // YOUR estimate of the event's probability (e.g., 0.75 = 75% chance)
  "riskLevel": "low|medium|high",
  "riskFactors": ["risk1", "risk2"],
  "opportunities": ["opportunity1", "opportunity2"],
  "recommendedAction": "BUY_YES|BUY_NO|AVOID"
}

**IMPORTANT:** Provide "estimatedProbability" - your numerical estimate (0-1) of how likely the event is to occur. 
This will be compared with the market price to find mispricing opportunities (edge).

Be thorough, analytical, and honest about both risks and opportunities.`;

        this.aiService = new AIService(systemPrompt);
    }

    /**
     * Анализирует один рынок и решает, стоит ли на нем торговать
     */
    async analyzeMarket(
        market: Market, 
        context?: FilterContext, 
        estimatedAttractiveness?: number,
        forceTavily?: boolean  // Принудительно использовать Tavily (для выбранных рынков)
    ): Promise<MarketAnalysis> {
        // Получаем новости если включено (как в Poly-Trader)
        let newsData = '';
        if (this.useNews && this.serpApiService) {
            try {
                const keywords = this.serpApiService.extractKeywords(market.question);
                const news = await this.serpApiService.searchNews(keywords, {
                    numResults: 5,
                    timeRange: 'past_24h'
                });
                
                if (news.length > 0) {
                    newsData = this.formatNewsForPrompt(news);
                    console.log(`📰 Found ${news.length} recent news articles for analysis`);
                }
            } catch (error) {
                console.warn('⚠️  Failed to fetch news, continuing without:', error);
            }
        }

        // Получаем глубокий анализ от Tavily:
        // 1. Для топ-рынков (attractiveness >= 75%)
        // 2. Для выбранных рынков (forceTavily=true) - независимо от attractiveness
        let tavilyData = '';
        const shouldUseTavily = this.tavilyService && (
            forceTavily ||  // Принудительно использовать для выбранных рынков
            (estimatedAttractiveness !== undefined &&
             estimatedAttractiveness >= AI_STRATEGY_CONFIG.TAVILY_ATTRACTIVENESS_THRESHOLD)
        );

        if (shouldUseTavily) {
            try {
                const tavilyResponse = await this.tavilyService!.deepSearch(market.question);
                if (tavilyResponse.results.length > 0) {
                    tavilyData = this.tavilyService!.formatResultsForPrompt(tavilyResponse);
                    console.log(`🔬 Tavily: Deep analysis with ${tavilyResponse.results.length} sources`);
                }
            } catch (error) {
                console.warn('⚠️  Tavily search failed, continuing without deep analysis:', error);
            }
        }

        const prompt = this.buildAnalysisPrompt(market, context, newsData, tavilyData);

        try {
            const response = await this.aiService.generateResponse(prompt, {
                parseJson: true,
                maxTokens: 2000,
                temperature: 0.3
            });

            // Парсим ответ
            let analysis: import('../../types/json').UnknownJSON;
            if (response.jsonPart) {
                analysis = response.jsonPart;
            } else {
                analysis = this.parseAnalysisFromText(response.response);
            }

            // Валидация и нормализация
            return this.normalizeAnalysis(analysis);

        } catch (error) {
            console.error('❌ AI market analysis failed:', error);
            // Безопасный дефолт - не торговать при ошибке
            return {
                shouldTrade: false,
                confidence: 0.0,
                reasoning: 'AI analysis failed - defaulting to no trade',
                attractiveness: 0.0,
                riskLevel: 'high',
                riskFactors: ['AI analysis unavailable'],
                opportunities: []
            };
        }
    }

    /**
     * Анализирует несколько рынков и возвращает только те, на которых стоит торговать
     */
    async filterMarkets(
        markets: Market[],
        context?: FilterContext
    ): Promise<Array<{ market: Market; analysis: MarketAnalysis }>> {
        if (markets.length === 0) {
            console.log(`   ⚠️  Нет рынков для AI анализа`);
            return [];
        }

        console.log(`   🔄 Начало AI анализа ${markets.length} рынков...`);

        // Сначала делаем быструю оценку attractiveness на основе базовых данных
        console.log(`   📊 Этап 1: Предварительная оценка attractiveness...`);
        const preliminaryAnalysis = await Promise.all(
            markets.map(async (market) => {
                // Простая оценка без полного AI анализа
                const yesToken = market.tokens.find(t => t.outcome === 'Yes');
                const baseAttractiveness = yesToken ? yesToken.price : 0.5;
                return { market, estimatedAttractiveness: baseAttractiveness };
            })
        );
        console.log(`      ✅ Предварительная оценка завершена`);

        console.log(`   🤖 Этап 2: Полный AI анализ каждого рынка...`);
        let analyzedCount = 0;
        const results = await Promise.all(
            preliminaryAnalysis.map(async ({ market, estimatedAttractiveness }) => {
                analyzedCount++;
                if (analyzedCount % 5 === 0) {
                    console.log(`      ⏳ Анализ: ${analyzedCount}/${markets.length} рынков...`);
                }
                
                try {
                    const analysis = await this.analyzeMarket(market, context, estimatedAttractiveness);
                    
                    if (analyzedCount <= 3 || analysis.shouldTrade) {
                        // Логируем первые 3 или те, что прошли фильтр
                        const yesToken = market.tokens.find(t => t.outcome === 'Yes');
                        const marketPrice = yesToken?.price ?? 0.5;
                        console.log(`      [${analyzedCount}/${markets.length}] ${market.question.substring(0, 40)}...`);
                        console.log(`         Attractiveness: ${(analysis.attractiveness * 100).toFixed(1)}%`);
                        if (analysis.estimatedProbability !== undefined) {
                            const edge = Math.abs(analysis.estimatedProbability - marketPrice);
                            console.log(`         AI Probability: ${(analysis.estimatedProbability * 100).toFixed(1)}% | Market: ${(marketPrice * 100).toFixed(1)}% | Edge: ${(edge * 100).toFixed(1)} п.п.`);
                        }
                        console.log(`         Risk: ${analysis.riskLevel.toUpperCase()}`);
                        console.log(`         Should Trade: ${analysis.shouldTrade ? '✅' : '❌'}`);
                    }
                    
                    return { market, analysis };
                } catch (error) {
                    console.error(`      ❌ Ошибка анализа рынка ${market.question.substring(0, 30)}:`, error);
                    // Возвращаем дефолтный анализ (не торговать)
                    return {
                        market,
                        analysis: {
                            shouldTrade: false,
                            confidence: 0,
                            reasoning: 'Analysis failed',
                            attractiveness: 0,
                            riskLevel: 'high' as const,
                            riskFactors: ['Analysis error'],
                            opportunities: []
                        }
                    };
                }
            })
        );
        console.log(`      ✅ AI анализ завершен для всех ${markets.length} рынков`);

        console.log(`   🔍 Этап 3: Фильтрация результатов...`);
        
        // Фильтруем по shouldTrade
        const beforeShouldTrade = results.length;
        const tradable = results.filter(r => r.analysis.shouldTrade === true);
        const afterShouldTrade = tradable.length;
        console.log(`      - Фильтр shouldTrade: ${beforeShouldTrade} → ${afterShouldTrade} (отфильтровано ${beforeShouldTrade - afterShouldTrade})`);

        // Применяем дополнительные фильтры из context
        let filtered = tradable;

        if (context?.minAttractiveness !== undefined) {
            const beforeAttractiveness = filtered.length;
            filtered = filtered.filter(
                r => r.analysis.attractiveness >= context.minAttractiveness!
            );
            const afterAttractiveness = filtered.length;
            console.log(`      - Фильтр attractiveness (мин ${(context.minAttractiveness * 100).toFixed(0)}%): ${beforeAttractiveness} → ${afterAttractiveness} (отфильтровано ${beforeAttractiveness - afterAttractiveness})`);
        }

        if (context?.maxRisk) {
            const beforeRisk = filtered.length;
            const riskLevels = { low: 0, medium: 1, high: 2 };
            const maxRiskLevel = riskLevels[context.maxRisk];
            filtered = filtered.filter(r => 
                riskLevels[r.analysis.riskLevel] <= maxRiskLevel
            );
            const afterRisk = filtered.length;
            console.log(`      - Фильтр риска (макс ${context.maxRisk.toUpperCase()}): ${beforeRisk} → ${afterRisk} (отфильтровано ${beforeRisk - afterRisk})`);
        }

        if (context?.preferredCategories && context.preferredCategories.length > 0) {
            const beforeCategories = filtered.length;
            filtered = filtered.filter(r =>
                r.market.category && context.preferredCategories!.includes(r.market.category)
            );
            const afterCategories = filtered.length;
            console.log(`      - Фильтр категорий (whitelist): ${beforeCategories} → ${afterCategories} (отфильтровано ${beforeCategories - afterCategories})`);
        }

        if (context?.excludedCategories && context.excludedCategories.length > 0) {
            const beforeExcluded = filtered.length;
            filtered = filtered.filter(r =>
                !r.market.category || !context.excludedCategories!.includes(r.market.category)
            );
            const afterExcluded = filtered.length;
            console.log(`      - Фильтр категорий (blacklist): ${beforeExcluded} → ${afterExcluded} (отфильтровано ${beforeExcluded - afterExcluded})`);
        }

        // Сортируем по attractiveness
        filtered.sort((a, b) => b.analysis.attractiveness - a.analysis.attractiveness);

        console.log(`\n   ✅ ИТОГО AI фильтрации: ${markets.length} → ${filtered.length} рынков`);
        if (filtered.length > 0) {
            console.log(`   📊 Топ-3 по attractiveness:`);
            filtered.slice(0, 3).forEach((r, i) => {
                console.log(`      ${i + 1}. ${(r.analysis.attractiveness * 100).toFixed(1)}% - ${r.market.question.substring(0, 50)}...`);
            });
        }

        // Этап 4: Повторный анализ выбранных рынков с Tavily (если не использовался ранее)
        // Для выбранных рынков используем оба источника (SerpAPI + Tavily) для более глубокого анализа
        if (filtered.length > 0 && 
            this.tavilyService && 
            AI_STRATEGY_CONFIG.USE_TAVILY_FOR_SELECTED_MARKETS) {
            const needsTavily = filtered.filter(item => {
                // Используем Tavily если не использовали ранее (attractiveness < 75%)
                return item.analysis.attractiveness < AI_STRATEGY_CONFIG.TAVILY_ATTRACTIVENESS_THRESHOLD;
            });

            if (needsTavily.length > 0) {
                console.log(`\n   🔬 Этап 4: Глубокий анализ с Tavily для ${needsTavily.length} выбранных рынков...`);
                
                const enrichedResults = await Promise.all(
                    filtered.map(async (item) => {
                        // Если Tavily еще не использовался для этого рынка - используем сейчас
                        if (item.analysis.attractiveness < AI_STRATEGY_CONFIG.TAVILY_ATTRACTIVENESS_THRESHOLD) {
                            try {
                                console.log(`      🔍 Tavily deep analysis for: ${item.market.question.substring(0, 50)}...`);
                                // Повторный анализ с Tavily
                                const enrichedAnalysis = await this.analyzeMarket(
                                    item.market, 
                                    context, 
                                    item.analysis.attractiveness,
                                    true  // forceTavily = true
                                );
                                
                                // Объединяем результаты: берем лучшее из обоих анализов
                                return {
                                    market: item.market,
                                    analysis: {
                                        ...enrichedAnalysis,
                                        // Используем более высокую confidence если новый анализ лучше
                                        confidence: Math.max(item.analysis.confidence, enrichedAnalysis.confidence),
                                        // Обновляем attractiveness если новый анализ выше
                                        attractiveness: Math.max(item.analysis.attractiveness, enrichedAnalysis.attractiveness)
                                    }
                                };
                            } catch (error) {
                                console.warn(`      ⚠️  Tavily analysis failed, keeping original: ${error}`);
                                return item; // Оставляем оригинальный анализ
                            }
                        }
                        return item; // Tavily уже использовался или не нужен
                    })
                );

                console.log(`      ✅ Глубокий анализ завершен`);
                return enrichedResults;
            }
        }

        return filtered;
    }

    /**
     * Форматирование новостей для промпта
     */
    private formatNewsForPrompt(news: Array<{ title: string; snippet?: string; source?: string; date?: string }>): string {
        if (news.length === 0) return '';

        let formatted = '\n**Recent News (Last 24 Hours):**\n';
        news.slice(0, 5).forEach((article, index) => {
            formatted += `${index + 1}. ${article.title}\n`;
            if (article.snippet) {
                formatted += `   ${article.snippet.substring(0, 150)}...\n`;
            }
            if (article.source) {
                formatted += `   Source: ${article.source}`;
            }
            formatted += '\n\n';
        });

        return formatted;
    }

    /**
     * Построить детальный промпт для анализа (как в Poly-Trader)
     * Теперь с интеграцией новостей через SerpAPI и глубокого анализа через Tavily
     */
    private buildAnalysisPrompt(market: Market, context?: FilterContext, newsData?: string, tavilyData?: string): string {
        const yesToken = market.tokens.find(t => t.outcome === 'Yes');
        const noToken = market.tokens.find(t => t.outcome === 'No');
        const yesPrice = yesToken?.price || 0;
        const noPrice = noToken?.price || 0;

        const now = new Date();
        const endDate = market.end_date_iso ? new Date(market.end_date_iso) : null;
        const daysToResolution = endDate
            ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            : null;

        let prompt = `Analyze this Polymarket prediction market in detail and determine if it's suitable for trading:\n\n`;

        // Основная информация о рынке
        prompt += `**Market Information:**\n`;
        prompt += `Question: "${market.question}"\n`;
        if (market.description) {
            prompt += `Description: ${market.description}\n`;
        }
        prompt += `\n`;

        // Рыночные данные
        prompt += `**Current Market Data:**\n`;
        prompt += `- YES Token Price: ${(yesPrice * 100).toFixed(2)}% (${yesPrice.toFixed(4)})\n`;
        prompt += `- NO Token Price: ${(noPrice * 100).toFixed(2)}% (${noPrice.toFixed(4)})\n`;
        prompt += `\n**Your Task:** Compare YOUR estimated probability ("estimatedProbability") with the market price above. `;
        prompt += `If there's a significant difference (edge), this is a trading opportunity. `;
        prompt += `For example: if market price is 70% but you estimate 85%, that's a +15 percentage point edge.\n`;
        prompt += `- Market Active: ${market.active}\n`;
        prompt += `- Accepting Orders: ${market.accepting_orders}\n`;
        prompt += `- NegRisk Market: ${market.neg_risk}\n`;

        if (daysToResolution !== null) {
            prompt += `- Days to Resolution: ${daysToResolution}\n`;
            if (endDate) {
                prompt += `- Resolution Date: ${endDate.toISOString().split('T')[0]}\n`;
            }
        }

        if (market.category) {
            prompt += `- Category: ${market.category}\n`;
        }

        if (market.tags && market.tags.length > 0) {
            prompt += `- Tags: ${market.tags.join(', ')}\n`;
        }

        // Контекст торговли
        if (context) {
            prompt += `\n**Trading Context:**\n`;
            if (context.strategyType) {
                prompt += `- Strategy Type: ${context.strategyType}\n`;
            }
            if (context.preferredCategories) {
                prompt += `- Preferred Categories: ${context.preferredCategories.join(', ')}\n`;
            }
            if (context.excludedCategories) {
                prompt += `- Excluded Categories: ${context.excludedCategories.join(', ')}\n`;
            }
        }

        // Добавляем новости если есть (SerpAPI)
        if (newsData) {
            prompt += newsData;
            prompt += `\n**Important:** Use the recent news above to inform your analysis. `;
            prompt += `Consider how current events might affect the outcome.\n`;
        }

        // Добавляем глубокий анализ от Tavily если есть
        if (tavilyData) {
            prompt += tavilyData;
            prompt += `\n**Deep Analysis:** Use the detailed context above from multiple sources `;
            prompt += `to make a more informed decision. Consider cross-referencing information `;
            prompt += `from different sources for accuracy.\n`;
        }

        // Дополнительные вопросы для глубокого анализа
        prompt += `\n**Analysis Questions to Consider:**\n`;
        prompt += `1. Is the question clear and will it resolve unambiguously?\n`;
        prompt += `2. Does the current market price seem efficient or is there mispricing?\n`;
        if (newsData) {
            prompt += `2a. How do recent news affect the market price and probability?\n`;
        }
        prompt += `3. What are the main risks in this market?\n`;
        prompt += `4. Are there opportunities for profitable trading?\n`;
        prompt += `5. Does this market fit the trading strategy?\n`;
        if (newsData) {
            prompt += `6. Based on recent news, is there new information that changes the outlook?\n`;
        } else {
            prompt += `6. What information would help make a better decision?\n`;
        }

        prompt += `\nProvide your detailed analysis in JSON format as specified.`;

        return prompt;
    }

    /**
     * Нормализация ответа AI
     */
    private normalizeAnalysis(data: unknown): MarketAnalysis {
        const typed = data as import('../../types/ai-response').AIMarketAnalysisJSON;
        
        const confidenceValue = typeof typed.confidence === 'string' 
            ? parseFloat(typed.confidence) 
            : (typeof typed.confidence === 'number' ? typed.confidence : undefined);
        const confidence = confidenceValue !== undefined 
            ? Math.max(0, Math.min(1, confidenceValue || 0.5))
            : 0.5;

        const attractivenessValue = typeof typed.attractiveness === 'string'
            ? parseFloat(typed.attractiveness)
            : (typeof typed.attractiveness === 'number' ? typed.attractiveness : undefined);
        const attractiveness = attractivenessValue !== undefined
            ? Math.max(0, Math.min(1, attractivenessValue || 0.5))
            : 0.5;

        // Извлекаем estimatedProbability
        const estimatedProbabilityValue = typed.estimatedProbability !== undefined
            ? (typeof typed.estimatedProbability === 'string' 
                ? parseFloat(typed.estimatedProbability)
                : (typeof typed.estimatedProbability === 'number' 
                    ? typed.estimatedProbability 
                    : undefined))
            : undefined;
        const estimatedProbability = estimatedProbabilityValue !== undefined
            ? Math.max(0, Math.min(1, estimatedProbabilityValue))
            : undefined;

        return {
            shouldTrade: typeof typed.shouldTrade === 'boolean' 
                ? typed.shouldTrade 
                : Boolean(typed.shouldTrade),
            confidence,
            reasoning: typed.reasoning || typed.reason || 'No reasoning provided',
            attractiveness,
            estimatedProbability, // Оценка вероятности от AI
            riskLevel: (typeof typed.riskLevel === 'string' && ['low', 'medium', 'high'].includes(typed.riskLevel))
                ? typed.riskLevel as 'low' | 'medium' | 'high'
                : 'medium',
            riskFactors: Array.isArray(typed.riskFactors)
                ? typed.riskFactors as string[]
                : (typed.riskFactors ? [String(typed.riskFactors)] : []),
            opportunities: Array.isArray(typed.opportunities)
                ? typed.opportunities as string[]
                : (typed.opportunities ? [String(typed.opportunities)] : []),
            recommendedAction: (typeof typed.recommendedAction === 'string' && ['BUY_YES', 'BUY_NO', 'AVOID'].includes(typed.recommendedAction))
                ? typed.recommendedAction as 'BUY_YES' | 'BUY_NO' | 'AVOID'
                : undefined
        };
    }

    /**
     * Парсинг анализа из текста (fallback)
     */
    private parseAnalysisFromText(text: string): import('../../types/json').UnknownJSON {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (error) {
                console.warn('⚠️  Failed to parse JSON from AI response:', error);
            }
        }

        // Попытка извлечь ключевые значения
        const shouldTradeMatch = text.match(/shouldTrade["\s]*:[\s]*(true|false)/i);
        const shouldTrade = shouldTradeMatch && shouldTradeMatch[1] 
            ? shouldTradeMatch[1].toLowerCase() === 'true' 
            : false;

        const confidenceMatch = text.match(/confidence["\s]*:[\s]*([0-9.]+)/i);
        const confidence = confidenceMatch && confidenceMatch[1] 
            ? parseFloat(confidenceMatch[1]) 
            : 0.5;

        return {
            shouldTrade,
            confidence,
            reasoning: text.substring(0, 300),
            attractiveness: confidence,
            riskLevel: 'medium',
            riskFactors: [],
            opportunities: []
        };
    }
}

