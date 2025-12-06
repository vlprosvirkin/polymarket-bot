/**
 * SerpAPI Adapter
 *
 * Адаптер для работы с SerpAPI (Google Search API)
 * Используется для получения новостей и информации о событиях
 */

import axios, { AxiosInstance } from 'axios';
import type { SerpAPIResponse, SerpAPINewsItem, SerpAPIOrganicItem } from '../types/api-responses';

export interface NewsArticle {
    title: string;
    link: string;
    snippet?: string;
    date?: string;
    source?: string;
}

export interface OrganicResult {
    title: string;
    link: string;
    snippet: string;
}

export interface SerpSearchOptions {
    location?: string;
    language?: string;
    numResults?: number;
    timeRange?: 'past_24h' | 'past_week' | 'past_month';
}

export interface EventInfoResult {
    news: NewsArticle[];
    generalInfo?: OrganicResult[];
}

/**
 * SerpAPI Adapter
 *
 * @example
 * ```typescript
 * const serpApi = new SerpApiAdapter();
 * const news = await serpApi.searchNews('Bitcoin price');
 * const eventInfo = await serpApi.searchEventInfo('US Election 2024');
 * ```
 */
export class SerpApiAdapter {
    private client: AxiosInstance;
    private apiKey: string;
    private readonly baseUrl = 'https://serpapi.com/search';

    constructor(apiKey?: string) {
        const key = apiKey || process.env.SERP_API_KEY;
        if (!key) {
            throw new Error('SERP_API_KEY environment variable is required');
        }
        this.apiKey = key;

        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Поиск новостей по запросу
     */
    async searchNews(query: string, options: SerpSearchOptions = {}): Promise<NewsArticle[]> {
        try {
            const params: Record<string, string | number> = {
                q: query,
                engine: 'google',
                api_key: this.apiKey,
                tbm: 'nws', // News search
                num: options.numResults || 10,
            };

            if (options.location) {
                params.location = options.location;
            }

            if (options.language) {
                params.hl = options.language;
            }

            if (options.timeRange) {
                const timeRangeMap: Record<string, string> = {
                    'past_24h': 'd',
                    'past_week': 'w',
                    'past_month': 'm'
                };
                params.tbs = `qdr:${timeRangeMap[options.timeRange]}`;
            }

            console.warn(`🔍 SerpAPI: Searching news for "${query}"...`);

            const response = await this.client.get<SerpAPIResponse>('', { params });
            const data = response.data;

            const news: NewsArticle[] = [];

            if (data.news_results && Array.isArray(data.news_results)) {
                data.news_results.forEach((item: SerpAPINewsItem) => {
                    news.push({
                        title: item.title || '',
                        link: item.link || '',
                        snippet: item.snippet || '',
                        date: item.date || '',
                        source: item.source || ''
                    });
                });
            }

            console.warn(`✅ SerpAPI: Found ${news.length} news articles`);
            return news;

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('❌ SerpAPI search failed:', errorMessage);
            return [];
        }
    }

    /**
     * Поиск информации о событии (комплексный поиск)
     */
    async searchEventInfo(eventName: string, options: {
        location?: string;
        numNews?: number;
        timeRange?: 'past_24h' | 'past_week' | 'past_month';
    } = {}): Promise<EventInfoResult> {
        try {
            const params: Record<string, string | number> = {
                q: eventName,
                engine: 'google',
                api_key: this.apiKey,
                num: 10,
            };

            if (options.location) {
                params.location = options.location;
            }

            console.warn(`🔍 SerpAPI: Searching info for "${eventName}"...`);

            const response = await this.client.get<SerpAPIResponse>('', { params });
            const data = response.data;

            // Новости
            const news: NewsArticle[] = [];
            if (data.news_results && Array.isArray(data.news_results)) {
                data.news_results.slice(0, options.numNews || 5).forEach((item: SerpAPINewsItem) => {
                    news.push({
                        title: item.title || '',
                        link: item.link || '',
                        snippet: item.snippet || '',
                        date: item.date || '',
                        source: item.source || ''
                    });
                });
            }

            // Общая информация
            const generalInfo: OrganicResult[] = [];
            if (data.organic_results && Array.isArray(data.organic_results)) {
                data.organic_results.slice(0, 3).forEach((item: SerpAPIOrganicItem) => {
                    generalInfo.push({
                        title: item.title || '',
                        link: item.link || '',
                        snippet: item.snippet || ''
                    });
                });
            }

            console.warn(`✅ SerpAPI: Found ${news.length} news + ${generalInfo.length} general results`);

            return {
                news,
                generalInfo: generalInfo.length > 0 ? generalInfo : undefined
            };

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('❌ SerpAPI search failed:', errorMessage);
            return { news: [] };
        }
    }

    /**
     * Извлечение ключевых слов из вопроса рынка для поиска
     */
    extractKeywords(question: string): string {
        const stopWords = ['will', 'win', 'the', 'a', 'an', 'be', 'is', 'are', 'at', 'in', 'on', 'by', 'for', 'to'];

        let keywords = question
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.includes(word))
            .slice(0, 5)
            .join(' ');

        if (keywords.length < 10) {
            keywords = question.substring(0, 100);
        }

        return keywords;
    }

    /**
     * Форматирование результатов для AI промпта
     */
    formatResultsForPrompt(result: EventInfoResult): string {
        if (result.news.length === 0 && !result.generalInfo?.length) {
            return '';
        }

        let formatted = '\n**News Context (SerpAPI):**\n';

        if (result.news.length > 0) {
            formatted += '\n**Recent News:**\n';
            result.news.slice(0, 5).forEach((article, index) => {
                formatted += `${index + 1}. **${article.title}**\n`;
                if (article.snippet) {
                    formatted += `   ${article.snippet}\n`;
                }
                formatted += `   Source: ${article.source || 'Unknown'} | Date: ${article.date || 'Unknown'}\n\n`;
            });
        }

        if (result.generalInfo && result.generalInfo.length > 0) {
            formatted += '**General Information:**\n';
            result.generalInfo.forEach((item, index) => {
                formatted += `${index + 1}. ${item.title}\n   ${item.snippet}\n\n`;
            });
        }

        return formatted;
    }
}
