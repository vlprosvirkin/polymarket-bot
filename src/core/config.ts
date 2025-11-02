/**
 * Configuration for AI services
 */
export const API_CONFIG = {
    openai: {
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4000', 10)
    },
    gemini: {
        maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS || '4000', 10)
    }
};

