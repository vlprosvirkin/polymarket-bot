/**
 * Configuration for AI services
 */
export const API_CONFIG = {
    openai: {
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4000', 10)
    },
    gemini: {
        maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS || '4000', 10)
    },
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        chatId: process.env.TELEGRAM_CHAT_ID || ''
    }
};

/**
 * AI Strategy configuration constants
 */
export const AI_STRATEGY_CONFIG = {
    MAX_MARKETS_FOR_AI: 20,                    // Максимум рынков для AI анализа
    DEFAULT_MIN_ATTRACTIVENESS: 0.65,          // Минимальная привлекательность по умолчанию
    DEFAULT_MAX_RISK: 'medium' as const,       // Максимальный риск по умолчанию
    STRATEGY_TYPE: 'high-confidence' as const,  // Тип стратегии для AI анализа
    ATTRACTIVENESS_THRESHOLD_FOR_SIGNALS: 0.7,   // Порог attractiveness для генерации сигналов
    USE_TAVILY_FOR_TOP_MARKETS: true,           // Использовать Tavily для топ-рынков
    TAVILY_ATTRACTIVENESS_THRESHOLD: 0.75,      // Минимум attractiveness для использования Tavily в первом проходе
    USE_TAVILY_FOR_SELECTED_MARKETS: true,      // Использовать Tavily для всех выбранных рынков (второй проход)
    // Это позволяет использовать оба источника (SerpAPI + Tavily) одновременно
    MIN_EDGE_PERCENTAGE_POINTS: 0.10,          // Минимальный edge для входа: 10 процентных пунктов (0.10)
    // Edge = |AI_probability - market_price|
    // Если edge < 0.10, рынок считается эффективным
    
    // Dynamic position sizing multipliers
    POSITION_SIZING: {
        MIN_MULTIPLIER: 0.5,                   // Минимум: 0.5x базового размера
        MAX_MULTIPLIER: 6.0,                   // Максимум: 6.0x базового размера
        EDGE_SCALING: 5.0                      // Коэффициент масштабирования для edge (edge * 5 = multiplier)
    }
};

