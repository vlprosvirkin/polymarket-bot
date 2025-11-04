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

interface CacheEntry {
    response: TavilySearchResponse;
    timestamp: number;
}

export class TavilyService {
    private apiKey: string;
    private baseUrl = 'https://api.tavily.com';
    private cache: Map<string, CacheEntry> = new Map();
    private readonly cacheTTL = 60 * 60 * 1000; // 1 hour in milliseconds

    constructor() {
        const apiKey = process.env.TAVILY_API_KEY;
        if (!apiKey) {
            throw new Error('TAVILY_API_KEY environment variable is required');
        }
        this.apiKey = apiKey;

        // Периодическая очистка старых записей (каждые 15 минут)
        setInterval(() => this.cleanupCache(), 15 * 60 * 1000);
    }

    /**
     * Генерация ключа кэша на основе запроса и опций
     */
    private getCacheKey(query: string, options: TavilySearchOptions): string {
        const normalizedQuery = query.toLowerCase().trim();
        const optionsKey = JSON.stringify({
            maxResults: options.maxResults || 5,
            includeAnswer: options.includeAnswer || false,
            searchDepth: options.searchDepth || 'basic',
            includeImages: options.includeImages || false,
            includeRawContent: options.includeRawContent || false
        });
        return `${normalizedQuery}::${optionsKey}`;
    }

    /**
     * Получение результата из кэша
     */
    private getFromCache(cacheKey: string): TavilySearchResponse | null {
        const cached = this.cache.get(cacheKey);
        if (!cached) {
            return null;
        }

        const age = Date.now() - cached.timestamp;
        if (age > this.cacheTTL) {
            // Запись устарела
            this.cache.delete(cacheKey);
            return null;
        }

        return cached.response;
    }

    /**
     * Сохранение результата в кэш
     */
    private saveToCache(cacheKey: string, response: TavilySearchResponse): void {
        this.cache.set(cacheKey, {
            response,
            timestamp: Date.now()
        });
    }

    /**
     * Очистка устаревших записей из кэша
     */
    private cleanupCache(): void {
        const now = Date.now();
        let removed = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.cacheTTL) {
                this.cache.delete(key);
                removed++;
            }
        }

        if (removed > 0) {
            console.log(`🧹 Tavily cache cleanup: removed ${removed} expired entries`);
        }
    }

    /**
     * Получение статистики кэша
     */
    getCacheStats(): { size: number; hits: number; misses: number } {
        return {
            size: this.cache.size,
            hits: this.cacheHits,
            misses: this.cacheMisses
        };
    }

    private cacheHits = 0;
    private cacheMisses = 0;

    /**
     * Поиск информации с Tavily
     * Возвращает структурированные результаты, готовые для AI промптов
     * Использует кэширование для экономии средств (TTL = 1 час)
     */
    async search(
        query: string,
        options: TavilySearchOptions = {}
    ): Promise<TavilySearchResponse> {
        // Проверяем кэш
        const cacheKey = this.getCacheKey(query, options);
        const cached = this.getFromCache(cacheKey);

        if (cached) {
            this.cacheHits++;
            console.log(`💾 Tavily: Cache HIT for "${query}" (saved $0.02) [${this.cacheHits}/${this.cacheHits + this.cacheMisses}]`);
            return cached;
        }

        this.cacheMisses++;

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

            console.log(`🔍 Tavily: Searching "${query}" (depth: ${options.searchDepth || 'basic'}) [${this.cacheHits}/${this.cacheHits + this.cacheMisses}]...`);

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

            const result = {
                query: data.query || query,
                responseTime: data.response_time || 0,
                results,
                answer: data.answer || undefined
            };

            // Сохраняем в кэш
            this.saveToCache(cacheKey, result);

            return result;

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

