/**
 * SerpAPI Service - для получения новостей и данных о событиях
 * Используется как в Poly-Trader для обогащения данных для AI анализа
 */

import axios from 'axios';
import type { SerpAPIResponse, SerpAPINewsItem, SerpAPIOrganicItem } from '../types/api-responses';

export interface NewsArticle {
    title: string;
    link: string;
    snippet?: string;
    date?: string;
    source?: string;
}

export interface SearchResult {
    news?: NewsArticle[];
    organic?: Array<{
        title: string;
        link: string;
        snippet: string;
    }>;
}

export class SerpAPIService {
    private apiKey: string;
    private baseUrl = 'https://serpapi.com/search';

    constructor() {
        const apiKey = process.env.SERP_API_KEY;
        if (!apiKey) {
            throw new Error('SERP_API_KEY environment variable is required');
        }
        this.apiKey = apiKey;
    }

    /**
     * Поиск новостей по запросу
     * Как в Poly-Trader - получаем новости для анализа событий
     */
    async searchNews(
        query: string,
        options: {
            location?: string;
            language?: string;
            numResults?: number;
            timeRange?: 'past_24h' | 'past_week' | 'past_month';
        } = {}
    ): Promise<NewsArticle[]> {
        try {
            const params: Record<string, string | number> = {
                q: query,
                engine: 'google',
                api_key: this.apiKey,
                tbm: 'nws',  // News search
                num: options.numResults || 10,
            };

            if (options.location) {
                params.location = options.location;
            }

            if (options.language) {
                params.hl = options.language;
            }

            if (options.timeRange) {
                params.tbs = `qdr:${options.timeRange === 'past_24h' ? 'd' : options.timeRange === 'past_week' ? 'w' : 'm'}`;
            }

            console.log(`🔍 SerpAPI: Searching news for "${query}"...`);

                   const response = await axios.get<SerpAPIResponse>(this.baseUrl, { params });
                   const data = response.data;

                   // Парсим новости из ответа
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

            console.log(`✅ SerpAPI: Found ${news.length} news articles`);

            return news;

               } catch (error: unknown) {
                   const errorMessage = error instanceof Error ? error.message : String(error);
                   console.error('❌ SerpAPI search failed:', errorMessage);
                   // Возвращаем пустой массив при ошибке, чтобы не блокировать основной процесс
                   return [];
               }
    }

    /**
     * Поиск информации о событии (комплексный поиск)
     * Получает и новости, и общую информацию
     */
    async searchEventInfo(
        eventName: string,
        options: {
            location?: string;
            numNews?: number;
            timeRange?: 'past_24h' | 'past_week' | 'past_month';
        } = {}
    ): Promise<{
        news: NewsArticle[];
        generalInfo?: Array<{
            title: string;
            link: string;
            snippet: string;
        }>;
    }> {
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

            console.log(`🔍 SerpAPI: Searching info for "${eventName}"...`);

            const response = await axios.get<SerpAPIResponse>(this.baseUrl, { params });
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
            const generalInfo: Array<{ title: string; link: string; snippet: string }> = [];
            if (data.organic_results && Array.isArray(data.organic_results)) {
                data.organic_results.slice(0, 3).forEach((item: SerpAPIOrganicItem) => {
                    generalInfo.push({
                        title: item.title || '',
                        link: item.link || '',
                        snippet: item.snippet || ''
                    });
                });
            }

            console.log(`✅ SerpAPI: Found ${news.length} news + ${generalInfo.length} general results`);

            return { news, generalInfo: generalInfo.length > 0 ? generalInfo : undefined };

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
        // Убираем общие слова и оставляем ключевые
        const stopWords = ['will', 'win', 'the', 'a', 'an', 'be', 'is', 'are', 'at', 'in', 'on', 'by', 'for', 'to'];
        
        let keywords = question
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.includes(word))
            .slice(0, 5)  // Берем первые 5 ключевых слов
            .join(' ');

        // Если слишком короткий запрос, используем весь вопрос
        if (keywords.length < 10) {
            keywords = question.substring(0, 100);
        }

        return keywords;
    }
}

