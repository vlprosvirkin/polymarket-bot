/**
 * Типы для API ответов от внешних сервисов
 */

/**
 * SerpAPI типы
 */
export interface SerpAPINewsItem {
    title?: string;
    link?: string;
    snippet?: string;
    date?: string;
    source?: string;
}

export interface SerpAPIOrganicItem {
    title?: string;
    link?: string;
    snippet?: string;
}

export interface SerpAPIResponse {
    news_results?: SerpAPINewsItem[];
    organic_results?: SerpAPIOrganicItem[];
}

/**
 * Tavily API типы
 */
export interface TavilyAPIResultItem {
    title?: string;
    url?: string;
    content?: string;
    score?: number;
    published_date?: string;
}

export interface TavilyAPIResponse {
    query?: string;
    results?: TavilyAPIResultItem[];
    response_time?: number;
    answer?: string;
}

/**
 * OpenAI API типы
 */
export interface OpenAIErrorWithStatus extends Error {
    status?: number;
    code?: string;
}

