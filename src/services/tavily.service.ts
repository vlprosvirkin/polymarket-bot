/**
 * Tavily Service - специализированный поисковый API для AI
 * Оптимизирован для интеграции с LLM, предоставляет структурированные данные
 */

import axios from 'axios';
import type { TavilyAPIResponse, TavilyAPIResultItem } from '../types/api-responses';

export interface TavilySearchResult {
    title: string;
    url: string;
    content: string;
    score: number;
    publishedDate?: string;
}

export interface TavilySearchResponse {
    query: string;
    responseTime: number;
    results: TavilySearchResult[];
    answer?: string;  // Готовый ответ от Tavily (если includeAnswer: true)
}

export interface TavilySearchOptions {
    maxResults?: number;        // Максимум результатов (default: 5)
    includeAnswer?: boolean;   // Включить готовый ответ (default: false)
    searchDepth?: 'basic' | 'advanced';  // Глубина поиска
    includeImages?: boolean;    // Включить изображения
    includeRawContent?: boolean; // Включить сырой контент
}

export class TavilyService {
    private apiKey: string;
    private baseUrl = 'https://api.tavily.com';

    constructor() {
        const apiKey = process.env.TAVILY_API_KEY;
        if (!apiKey) {
            throw new Error('TAVILY_API_KEY environment variable is required');
        }
        this.apiKey = apiKey;
    }

    /**
     * Поиск информации с Tavily
     * Возвращает структурированные результаты, готовые для AI промптов
     */
    async search(
        query: string,
        options: TavilySearchOptions = {}
    ): Promise<TavilySearchResponse> {
        try {
            const params: Record<string, string | number | boolean> = {
                api_key: this.apiKey,
                query,
                max_results: options.maxResults || 5,
                include_answer: options.includeAnswer || false,
                search_depth: options.searchDepth || 'basic',
                include_images: options.includeImages || false,
                include_raw_content: options.includeRawContent || false
            };

            console.log(`🔍 Tavily: Searching "${query}" (depth: ${options.searchDepth || 'basic'})...`);

            const response = await axios.post<TavilyAPIResponse>(`${this.baseUrl}/search`, params);
            const data = response.data;

            const results: TavilySearchResult[] = (data.results || []).map((item: TavilyAPIResultItem) => ({
                title: item.title || '',
                url: item.url || '',
                content: item.content || '',
                score: item.score || 0,
                publishedDate: item.published_date || undefined
            }));

            console.log(`✅ Tavily: Found ${results.length} results (response time: ${data.response_time || 0}ms)`);

            return {
                query: data.query || query,
                responseTime: data.response_time || 0,
                results,
                answer: data.answer || undefined
            };

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('❌ Tavily search failed:', errorMessage);
            throw error;
        }
    }

    /**
     * Глубокий поиск для важных рынков
     * Использует advanced search depth для получения более детальной информации
     */
    async deepSearch(query: string): Promise<TavilySearchResponse> {
        return this.search(query, {
            maxResults: 10,
            includeAnswer: true,
            searchDepth: 'advanced',
            includeRawContent: false
        });
    }

    /**
     * Быстрый поиск для массового анализа
     */
    async quickSearch(query: string, maxResults: number = 5): Promise<TavilySearchResponse> {
        return this.search(query, {
            maxResults,
            includeAnswer: false,
            searchDepth: 'basic'
        });
    }

    /**
     * Форматирование результатов для AI промпта
     */
    formatResultsForPrompt(response: TavilySearchResponse): string {
        if (response.results.length === 0) {
            return '';
        }

        let formatted = '\n**Detailed Context (Tavily):**\n';

        // Если есть готовый ответ от Tavily
        if (response.answer) {
            formatted += `\n**Summary:**\n${response.answer}\n\n`;
        }

        formatted += `**Sources:**\n`;
        response.results.slice(0, 5).forEach((result, index) => {
            formatted += `${index + 1}. **${result.title}**\n`;
            formatted += `   ${result.content.substring(0, 200)}...\n`;
            formatted += `   Source: ${result.url}\n`;
            if (result.publishedDate) {
                formatted += `   Date: ${result.publishedDate}\n`;
            }
            formatted += '\n';
        });

        return formatted;
    }
}

