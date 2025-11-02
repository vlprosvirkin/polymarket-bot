/**
 * AI Market Filter - вдохновлен подходом Poly-Trader
 * Использует AI для анализа рынков и выбора лучших для торговли
 * 
 * Основная идея: AI анализирует каждый рынок детально и решает,
 * стоит ли на нем торговать, основываясь на множестве факторов
 */

import type { Market } from '../../types/market.js';
import { AIService } from './ai.service.js';

export interface MarketAnalysis {
    shouldTrade: boolean;        // Стоит ли торговать на этом рынке
    confidence: number;          // Уверенность в решении (0-1)
    reasoning: string;           // Детальное обоснование
    attractiveness: number;      // Общая привлекательность (0-1)
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

    constructor() {
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
  "riskLevel": "low|medium|high",
  "riskFactors": ["risk1", "risk2"],
  "opportunities": ["opportunity1", "opportunity2"],
  "recommendedAction": "BUY_YES|BUY_NO|AVOID"
}

Be thorough, analytical, and honest about both risks and opportunities.`;

        this.aiService = new AIService(systemPrompt);
    }

    /**
     * Анализирует один рынок и решает, стоит ли на нем торговать
     */
    async analyzeMarket(market: Market, context?: FilterContext): Promise<MarketAnalysis> {
        const prompt = this.buildAnalysisPrompt(market, context);

        try {
            const response = await this.aiService.generateResponse(prompt, {
                parseJson: true,
                maxTokens: 2000,
                temperature: 0.3
            });

            // Парсим ответ
            let analysis: any;
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
        console.log(`🔍 Analyzing ${markets.length} markets with AI...`);

        const results = await Promise.all(
            markets.map(async (market) => {
                const analysis = await this.analyzeMarket(market, context);
                return { market, analysis };
            })
        );

        // Фильтруем по shouldTrade
        const tradable = results.filter(r => r.analysis.shouldTrade === true);

        // Применяем дополнительные фильтры из context
        let filtered = tradable;

        if (context?.minAttractiveness !== undefined) {
            filtered = filtered.filter(
                r => r.analysis.attractiveness >= context.minAttractiveness!
            );
        }

        if (context?.maxRisk) {
            const riskLevels = { low: 0, medium: 1, high: 2 };
            const maxRiskLevel = riskLevels[context.maxRisk];
            filtered = filtered.filter(r => 
                riskLevels[r.analysis.riskLevel] <= maxRiskLevel
            );
        }

        if (context?.preferredCategories && context.preferredCategories.length > 0) {
            filtered = filtered.filter(r =>
                r.market.category && context.preferredCategories!.includes(r.market.category)
            );
        }

        if (context?.excludedCategories && context.excludedCategories.length > 0) {
            filtered = filtered.filter(r =>
                !r.market.category || !context.excludedCategories!.includes(r.market.category)
            );
        }

        // Сортируем по attractiveness
        filtered.sort((a, b) => b.analysis.attractiveness - a.analysis.attractiveness);

        console.log(`✅ AI selected ${filtered.length} markets out of ${markets.length}`);

        return filtered;
    }

    /**
     * Построить детальный промпт для анализа (как в Poly-Trader)
     */
    private buildAnalysisPrompt(market: Market, context?: FilterContext): string {
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
        prompt += `- YES Token Price: ${(yesPrice * 100).toFixed(2)}%\n`;
        prompt += `- NO Token Price: ${(noPrice * 100).toFixed(2)}%\n`;
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

        // Дополнительные вопросы для глубокого анализа
        prompt += `\n**Analysis Questions to Consider:**\n`;
        prompt += `1. Is the question clear and will it resolve unambiguously?\n`;
        prompt += `2. Does the current market price seem efficient or is there mispricing?\n`;
        prompt += `3. What are the main risks in this market?\n`;
        prompt += `4. Are there opportunities for profitable trading?\n`;
        prompt += `5. Does this market fit the trading strategy?\n`;
        prompt += `6. What information would help make a better decision?\n`;

        prompt += `\nProvide your detailed analysis in JSON format as specified.`;

        return prompt;
    }

    /**
     * Нормализация ответа AI
     */
    private normalizeAnalysis(data: any): MarketAnalysis {
        return {
            shouldTrade: Boolean(data.shouldTrade),
            confidence: Math.max(0, Math.min(1, parseFloat(data.confidence) || 0.5)),
            reasoning: data.reasoning || data.reason || 'No reasoning provided',
            attractiveness: Math.max(0, Math.min(1, parseFloat(data.attractiveness) || 0.5)),
            riskLevel: ['low', 'medium', 'high'].includes(data.riskLevel) 
                ? data.riskLevel 
                : 'medium',
            riskFactors: Array.isArray(data.riskFactors)
                ? data.riskFactors
                : (data.riskFactors ? [String(data.riskFactors)] : []),
            opportunities: Array.isArray(data.opportunities)
                ? data.opportunities
                : (data.opportunities ? [String(data.opportunities)] : []),
            recommendedAction: ['BUY_YES', 'BUY_NO', 'AVOID'].includes(data.recommendedAction)
                ? data.recommendedAction
                : undefined
        };
    }

    /**
     * Парсинг анализа из текста (fallback)
     */
    private parseAnalysisFromText(text: string): any {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch {
                // Ignore
            }
        }

        // Попытка извлечь ключевые значения
        const shouldTradeMatch = text.match(/shouldTrade["\s]*:[\s]*(true|false)/i);
        const shouldTrade = shouldTradeMatch ? shouldTradeMatch[1].toLowerCase() === 'true' : false;

        const confidenceMatch = text.match(/confidence["\s]*:[\s]*([0-9.]+)/i);
        const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;

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

