/**
 * Типы для Tavily API ответов
 */

export interface TavilyAPIResult {
    title?: string;
    url?: string;
    content?: string;
    score?: number;
}

export interface TavilyAPIResponse {
    query?: string;
    results?: TavilyAPIResult[];
    answer?: string;
}

