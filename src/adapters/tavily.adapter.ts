/**
 * Tavily API Adapter
 *
 * Адаптер для работы с Tavily Search API
 * Специализированный поисковый API для AI с кэшированием
 */

import axios, { AxiosInstance } from 'axios';
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
    answer?: string;
}

export interface TavilySearchOptions {
    maxResults?: number;
    includeAnswer?: boolean;
    searchDepth?: 'basic' | 'advanced';
    includeImages?: boolean;
    includeRawContent?: boolean;
}

interface CacheEntry {
    response: TavilySearchResponse;
    timestamp: number;
}

/**
 * Tavily API Adapter
 *
 * @example
 * ```typescript
 * const tavily = new TavilyAdapter();
 * const results = await tavily.search('Bitcoin price prediction');
 * const deepResults = await tavily.deepSearch('US Election polls');
 * ```
 */
export class TavilyAdapter {
    private client: AxiosInstance;
    private apiKey: string;
    private readonly baseUrl = 'https://api.tavily.com';
    private cache: Map<string, CacheEntry> = new Map();
    private readonly cacheTTL = 60 * 60 * 1000; // 1 hour
    private cacheHits = 0;
    private cacheMisses = 0;
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(apiKey?: string) {
        const key = apiKey || process.env.TAVILY_API_KEY;
        if (!key) {
            throw new Error('TAVILY_API_KEY environment variable is required');
        }
        this.apiKey = key;

        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Периодическая очистка кэша (каждые 15 минут)
        this.cleanupInterval = setInterval(() => this.cleanupCache(), 15 * 60 * 1000);
    }

    /**
     * Остановка периодической очистки кэша
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Генерация ключа кэша
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
     * Очистка устаревших записей
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
            console.warn(`🧹 Tavily cache cleanup: removed ${removed} expired entries`);
        }
    }

    /**
     * Статистика кэша
     */
    getCacheStats(): { size: number; hits: number; misses: number } {
        return {
            size: this.cache.size,
            hits: this.cacheHits,
            misses: this.cacheMisses
        };
    }

    /**
     * Создание параметров запроса
     */
    private createSearchParams(query: string, options: TavilySearchOptions): Record<string, string | number | boolean> {
        return {
            api_key: this.apiKey,
            query,
            max_results: options.maxResults || 5,
            include_answer: options.includeAnswer || false,
            search_depth: options.searchDepth || 'basic',
            include_images: options.includeImages || false,
            include_raw_content: options.includeRawContent || false
        };
    }

    /**
     * Преобразование результатов API в TavilySearchResult[]
     */
    private mapApiResults(data: TavilyAPIResponse): TavilySearchResult[] {
        return (data.results || []).map((item: TavilyAPIResultItem) => ({
            title: item.title || '',
            url: item.url || '',
            content: item.content || '',
            score: item.score || 0,
            publishedDate: item.published_date || undefined
        }));
    }

    /**
     * Выполнение поискового запроса к API
     */
    private async performSearch(query: string, options: TavilySearchOptions): Promise<TavilySearchResponse> {
        const params = this.createSearchParams(query, options);
        console.warn(`🔍 Tavily: Searching "${query}" (depth: ${options.searchDepth || 'basic'}) [${this.cacheHits}/${this.cacheHits + this.cacheMisses}]...`);

        const response = await this.client.post<TavilyAPIResponse>('/search', params);
        const data = response.data;
        const results = this.mapApiResults(data);

        console.warn(`✅ Tavily: Found ${results.length} results (response time: ${data.response_time || 0}ms)`);

        return {
            query: data.query || query,
            responseTime: data.response_time || 0,
            results,
            answer: data.answer || undefined
        };
    }

    /**
     * Поиск с Tavily
     */
    async search(query: string, options: TavilySearchOptions = {}): Promise<TavilySearchResponse> {
        const cacheKey = this.getCacheKey(query, options);
        const cached = this.getFromCache(cacheKey);

        if (cached) {
            this.cacheHits++;
            console.warn(`💾 Tavily: Cache HIT for "${query}" (saved $0.02) [${this.cacheHits}/${this.cacheHits + this.cacheMisses}]`);
            return cached;
        }

        this.cacheMisses++;

        try {
            const result = await this.performSearch(query, options);
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
