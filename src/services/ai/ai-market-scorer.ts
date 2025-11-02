/**
 * AI Market Scorer
 * Использует AI для оценки привлекательности рынков для торговли
 */

import type { Market } from '../../types/market';
import { AIService } from './ai.service';

export interface MarketScore {
    score: number; // 0-1, где 1 = самый привлекательный
    confidence: number; // 0-1, уверенность AI в оценке
    reasoning: string; // Обоснование оценки
    riskFactors: string[]; // Факторы риска
    opportunities: string[]; // Выявленные возможности
}

export interface ScoringContext {
    strategyType?: 'endgame' | 'high-confidence' | 'market-making';
    currentPortfolio?: number; // Текущий размер портфеля
    riskTolerance?: 'low' | 'medium' | 'high';
}

export class AIMarketScorer {
    private aiService: AIService;

    constructor() {
        const systemPrompt = `You are an expert market analyst for prediction markets. 
Your task is to analyze markets on Polymarket and provide a numerical score (0-1) 
indicating how attractive a market is for trading based on:
- Question clarity and resolvability
- Market liquidity and volume signals
- Price efficiency and arbitrage opportunities
- Risk factors (manipulation, unclear resolution criteria)
- Time to resolution (markets closer to resolution are generally more attractive)
- Market category and track record

Always provide:
1. A score from 0 to 1 (1 = highly attractive)
2. Confidence level (0-1)
3. Brief reasoning (2-3 sentences)
4. Key risk factors (if any)
5. Opportunities you identified

Respond in JSON format.`;

        this.aiService = new AIService(systemPrompt);
    }

    /**
     * Оценить один рынок
     */
    async scoreMarket(market: Market, context?: ScoringContext): Promise<MarketScore> {
        const prompt = this.buildPrompt(market, context);
        
        try {
            const response = await this.aiService.generateResponse(prompt, {
                parseJson: true,
                maxTokens: 1000,
                temperature: 0.3
            });

            // Парсим JSON ответ
            let scoreData: import('../../types/json').UnknownJSON;
            if (response.jsonPart) {
                scoreData = response.jsonPart;
            } else {
                // Fallback: пытаемся парсить из текста
                scoreData = this.parseScoreFromText(response.response);
            }

            // Валидация и нормализация
            return this.normalizeScore(scoreData);
        } catch (error) {
            console.error('❌ AI scoring failed:', error);
            // Возвращаем безопасный дефолтный score
            return {
                score: 0.5,
                confidence: 0.0,
                reasoning: 'AI scoring unavailable, using default score',
                riskFactors: ['AI analysis failed'],
                opportunities: []
            };
        }
    }

    /**
     * Оценить несколько рынков (batch processing)
     */
    async scoreMarkets(
        markets: Market[], 
        context?: ScoringContext
    ): Promise<Array<{ market: Market; score: MarketScore }>> {
        const results = await Promise.all(
            markets.map(async (market) => ({
                market,
                score: await this.scoreMarket(market, context)
            }))
        );

        return results.sort((a, b) => b.score.score - a.score.score);
    }

    /**
     * Построить prompt для AI
     */
    private buildPrompt(market: Market, context?: ScoringContext): string {
        const yesToken = market.tokens.find(t => t.outcome === 'Yes');
        const noToken = market.tokens.find(t => t.outcome === 'No');
        const yesPrice = yesToken?.price || 0;
        const noPrice = noToken?.price || 0;

        const now = new Date();
        const endDate = market.end_date_iso ? new Date(market.end_date_iso) : null;
        const daysToResolution = endDate 
            ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            : null;

        let prompt = `Analyze this prediction market and provide a trading attractiveness score:\n\n`;
        prompt += `**Market Question:** ${market.question}\n`;
        prompt += `**Description:** ${market.description || 'No description'}\n\n`;
        
        prompt += `**Market Data:**\n`;
        prompt += `- YES Token Price: ${(yesPrice * 100).toFixed(2)}%\n`;
        prompt += `- NO Token Price: ${(noPrice * 100).toFixed(2)}%\n`;
        prompt += `- Active: ${market.active}\n`;
        prompt += `- Accepting Orders: ${market.accepting_orders}\n`;
        prompt += `- NegRisk Market: ${market.neg_risk}\n`;
        
        if (daysToResolution !== null) {
            prompt += `- Days to Resolution: ${daysToResolution}\n`;
        }
        
        if (market.category) {
            prompt += `- Category: ${market.category}\n`;
        }
        
        if (market.tags && market.tags.length > 0) {
            prompt += `- Tags: ${market.tags.join(', ')}\n`;
        }

        if (context) {
            prompt += `\n**Trading Context:**\n`;
            if (context.strategyType) {
                prompt += `- Strategy: ${context.strategyType}\n`;
            }
            if (context.riskTolerance) {
                prompt += `- Risk Tolerance: ${context.riskTolerance}\n`;
            }
        }

        prompt += `\nProvide your analysis in JSON format with: score (0-1), confidence (0-1), reasoning (string), riskFactors (array), opportunities (array).`;

        return prompt;
    }

    /**
     * Нормализация ответа AI
     */
    private normalizeScore(data: unknown): MarketScore {
        const typed = data as import('../../types/ai-response').AIMarketScoreJSON;
        
        const scoreValue = typeof typed.score === 'string' 
            ? parseFloat(typed.score) 
            : (typeof typed.score === 'number' ? typed.score : undefined);
        const score = scoreValue !== undefined 
            ? Math.max(0, Math.min(1, scoreValue || 0.5))
            : 0.5;

        const confidenceValue = typeof typed.confidence === 'string'
            ? parseFloat(typed.confidence)
            : (typeof typed.confidence === 'number' ? typed.confidence : undefined);
        const confidence = confidenceValue !== undefined
            ? Math.max(0, Math.min(1, confidenceValue || 0.5))
            : 0.5;

        return {
            score,
            confidence,
            reasoning: typed.reasoning || typed.reason || 'No reasoning provided',
            riskFactors: Array.isArray(typed.riskFactors)
                ? typed.riskFactors as string[]
                : (typed.riskFactors ? [String(typed.riskFactors)] : []),
            opportunities: Array.isArray(typed.opportunities)
                ? typed.opportunities as string[]
                : (typed.opportunities ? [String(typed.opportunities)] : [])
        };
    }

    /**
     * Парсинг score из текста (fallback)
     */
    private parseScoreFromText(text: string): import('../../types/json').UnknownJSON {
        // Попытка найти JSON в тексте
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (error) {
                console.warn('⚠️  Failed to parse JSON from AI scorer response:', error);
            }
        }

        // Попытка найти score в тексте
        const scoreMatch = text.match(/score["\s]*:[\s]*([0-9.]+)/i);
        const score = scoreMatch && scoreMatch[1] ? parseFloat(scoreMatch[1]) : 0.5;

        return {
            score,
            confidence: 0.3,
            reasoning: text.substring(0, 200),
            riskFactors: [],
            opportunities: []
        };
    }
}

