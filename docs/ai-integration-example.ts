/**
 * Пример интеграции AI Market Scorer в стратегию
 * Показывает, как использовать AI для улучшения фильтрации рынков
 */

import { AIMarketScorer, type ScoringContext } from '../services/ai/ai-market-scorer.js';
import type { Market } from '../types/market.js';
import type { StrategyConfig } from '../types/strategy.js';

// Пример 1: Базовая интеграция в filterMarkets()
export class ExampleStrategyWithAI {
    private aiScorer: AIMarketScorer;
    private config: StrategyConfig;
    private useAI: boolean = true; // Можно включить/выключить AI

    constructor(config: StrategyConfig) {
        this.config = config;
        this.aiScorer = new AIMarketScorer();
    }

    /**
     * Фильтрация с AI scoring
     */
    async filterMarkets(markets: Market[]): Promise<Market[]> {
        // 1. Базовая фильтрация (быстрая, отсеивает 90% рынков)
        const basicFiltered = this.basicFilter(markets);

        // 2. Если AI отключен, возвращаем базовую фильтрацию
        if (!this.useAI) {
            return basicFiltered.slice(0, this.config.maxMarkets);
        }

        // 3. AI Scoring для оставшихся рынков
        const scoringContext: ScoringContext = {
            strategyType: 'endgame', // или 'high-confidence'
            riskTolerance: 'medium'
        };

        const scored = await this.aiScorer.scoreMarkets(basicFiltered, scoringContext);

        // 4. Фильтруем по минимальному AI score (например, 0.6)
        const minAIScore = 0.6;
        const aiFiltered = scored
            .filter(item => item.score.score >= minAIScore)
            .sort((a, b) => b.score.score - a.score.score) // Сортируем по score
            .slice(0, this.config.maxMarkets)
            .map(item => item.market);

        return aiFiltered;
    }

    /**
     * Базовая фильтрация (без AI)
     */
    private basicFilter(markets: Market[]): Market[] {
        return markets.filter(market => {
            if (!market.active || market.closed || !market.accepting_orders) {
                return false;
            }
            if (!market.tokens || market.tokens.length === 0) {
                return false;
            }
            if (this.config.excludeNegRisk && market.neg_risk) {
                return false;
            }
            
            const yesToken = market.tokens.find(t => t.outcome === 'Yes');
            if (!yesToken) return false;

            const price = yesToken.price;
            if (this.config.minPrice && price < this.config.minPrice) {
                return false;
            }
            if (this.config.maxPrice && price > this.config.maxPrice) {
                return false;
            }

            return true;
        });
    }
}

// Пример 2: Использование AI для улучшения решений о входе
export class ExampleStrategyWithAIRiskCheck {
    private aiScorer: AIMarketScorer;

    constructor() {
        this.aiScorer = new AIMarketScorer();
    }

    /**
     * Генерация сигналов с проверкой риска через AI
     */
    async generateSignalsWithAIRiskCheck(
        market: Market,
        currentPrice: number
    ): Promise<any[]> {
        // Получаем AI оценку рынка
        const score = await this.aiScorer.scoreMarket(market, {
            strategyType: 'endgame',
            riskTolerance: 'medium'
        });

        // Проверка рисков
        if (score.score < 0.5) {
            console.log(`⚠️  Low AI score (${score.score.toFixed(2)}), skipping market`);
            return [];
        }

        if (score.riskFactors.length > 2) {
            console.log(`⚠️  High risk factors detected, skipping market`);
            return [];
        }

        // Если все хорошо, генерируем сигналы обычным способом
        // (здесь используем вашу существующую логику)
        
        return []; // Заглушка
    }
}

// Пример 3: Использование в боте
export class ExampleBotIntegration {
    private aiScorer: AIMarketScorer;

    async processMarkets(markets: Market[]): Promise<void> {
        this.aiScorer = new AIMarketScorer();

        // Вариант A: AI как дополнительный фильтр после базовой фильтрации
        const basicFiltered = markets.filter(m => m.active && !m.closed);
        const aiScored = await this.aiScorer.scoreMarkets(basicFiltered, {
            strategyType: 'endgame',
            riskTolerance: 'high'
        });

        // Берем только рынки с высоким AI score
        const topMarkets = aiScored
            .filter(item => item.score.score >= 0.7)
            .map(item => item.market);

        console.log(`✅ AI selected ${topMarkets.length} markets out of ${markets.length}`);

        // Обрабатываем отобранные рынки
        for (const market of topMarkets) {
            const scoreData = aiScored.find(s => s.market.condition_id === market.condition_id)?.score;
            
            console.log(`\n📊 Processing: ${market.question}`);
            console.log(`   AI Score: ${(scoreData?.score || 0) * 100}%`);
            console.log(`   Reasoning: ${scoreData?.reasoning}`);
            
            // Ваша логика торговли...
        }
    }

    // Вариант B: AI как ранжирование перед выбором топ N
    async rankAndSelectTopN(markets: Market[], n: number): Promise<Market[]> {
        this.aiScorer = new AIMarketScorer();

        const scored = await this.aiScorer.scoreMarkets(markets);
        
        return scored
            .sort((a, b) => b.score.score - a.score.score)
            .slice(0, n)
            .map(item => item.market);
    }
}

