/**
 * Типы для ответов от AI моделей
 */

/**
 * Структура JSON ответа от AI для анализа рынка
 */
export interface AIMarketAnalysisJSON {
    shouldTrade?: boolean | string;
    confidence?: number | string;
    reasoning?: string;
    reason?: string; // Алиас для reasoning
    attractiveness?: number | string;
    estimatedProbability?: number | string;  // Оценка вероятности события от AI (0-1)
    riskLevel?: 'low' | 'medium' | 'high' | string;
    riskFactors?: string[] | string;
    opportunities?: string[] | string;
    recommendedAction?: 'BUY_YES' | 'BUY_NO' | 'AVOID' | string;
}

/**
 * Структура JSON ответа от AI для scoring рынка
 */
export interface AIMarketScoreJSON {
    score?: number | string;
    confidence?: number | string;
    reasoning?: string;
    reason?: string; // Алиас для reasoning
    riskFactors?: string[] | string;
    opportunities?: string[] | string;
}

