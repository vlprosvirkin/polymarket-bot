/**
 * Типы для SerpAPI ответов
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

