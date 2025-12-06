/**
 * BaseEventAgent - Базовый класс для специализированных агентов анализа рынков
 *
 * Предоставляет:
 * - MCP (Model Context Protocol) интеграцию для доступа к внешним инструментам
 * - Кэширование результатов анализа
 * - Унифицированный интерфейс для всех агентов
 * - Rate limiting и error handling
 */

import { EnrichedMarket } from '../adapters/polymarket-data.adapter';
import { TavilyAdapter } from '../adapters/tavily.adapter';
import { getMCPRegistry, MCPServerConfig, AGENT_MCP_CONFIGS } from './MCPRegistry';

/**
 * Рекомендация агента по рынку
 */
export interface AgentRecommendation {
    /** Рекомендуемое действие */
    action: 'BUY' | 'SELL' | 'SKIP';
    /** Уверенность агента (0-1) */
    confidence: number;
    /** Обоснование рекомендации */
    reasoning: string;
    /** Источники информации */
    sources: string[];
    /** Оценка вероятности от агента */
    estimatedProbability?: number;
    /** Обнаруженный edge (разница между рынком и оценкой агента) */
    edge?: number;
    /** Дополнительные метаданные */
    metadata?: Record<string, unknown>;
}

/**
 * Контекст анализа рынка
 */
export interface AnalysisContext {
    /** Текущее время */
    timestamp: Date;
    /** Недавние новости */
    recentNews?: NewsItem[];
    /** Исторические данные */
    historicalData?: Record<string, unknown>;
    /** Дополнительный контекст */
    extra?: Record<string, unknown>;
}

/**
 * Новостная статья
 */
export interface NewsItem {
    title: string;
    url: string;
    content?: string;
    publishedDate?: string;
    source?: string;
    relevanceScore?: number;
}

/**
 * MCP Tool результат
 */
export interface MCPToolResult {
    content: Array<{
        type: string;
        text?: string;
        data?: unknown;
    }>;
    isError?: boolean;
}

/**
 * MCP SDK типы (для динамического импорта)
 */
// MCP Transport - opaque type from SDK, we don't need its internals
type MCPTransport = object;

interface MCPClient {
    connect(transport: MCPTransport): Promise<void>;
    callTool(request: { name: string; arguments: Record<string, unknown> }): Promise<MCPToolResult>;
    listTools(): Promise<{ tools?: Array<{ name: string }> }>;
    close(): Promise<void>;
}

interface MCPClientConstructor {
    new(info: { name: string; version: string }, opts: { capabilities: Record<string, unknown> }): MCPClient;
}

interface MCPStdioTransportConstructor {
    new(opts: { command: string; args: string[] }): MCPTransport;
}

interface MCPSdkModule {
    Client: MCPClientConstructor;
}

interface MCPStdioModule {
    StdioClientTransport: MCPStdioTransportConstructor;
}

/**
 * Конфигурация агента
 */
export interface AgentConfig {
    /** Имя агента */
    name: string;
    /** Включен ли агент */
    enabled: boolean;
    /** Минимальная уверенность для рекомендации (0-1) */
    minConfidence: number;
    /** TTL кэша в миллисекундах */
    cacheTTL: number;
    /** Максимальное количество анализов в минуту */
    rateLimitPerMinute: number;
    /** Использовать ли поиск новостей */
    useNewsSearch: boolean;
    /** Максимальное количество новостей */
    maxNewsResults: number;
}

/**
 * Запись кэша
 */
interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

/**
 * BaseEventAgent - Абстрактный базовый класс для агентов
 *
 * @example
 * ```typescript
 * class SportsAgent extends BaseEventAgent {
 *     getCategory(): string { return 'sports'; }
 *     getKeywords(): string[] { return ['NBA', 'NFL', 'game', 'match']; }
 *     async analyze(market: EnrichedMarket): Promise<AgentRecommendation> {
 *         // Специфичная логика для спорта
 *     }
 * }
 * ```
 */
export abstract class BaseEventAgent {
    protected config: AgentConfig;
    protected cache: Map<string, CacheEntry<AgentRecommendation>> = new Map();
    protected tavilyAdapter: TavilyAdapter | null = null;

    // Rate limiting
    private requestTimestamps: number[] = [];

    // MCP Clients (поддержка нескольких серверов)
    protected mcpClients: Map<string, MCPClient> = new Map();
    protected mcpConnected: Set<string> = new Set();

    // Cleanup interval для кэша
    private cleanupInterval?: NodeJS.Timeout;

    // Обратная совместимость: один клиент по умолчанию
    protected get mcpClient(): MCPClient | null {
        // Возвращаем первый подключенный клиент или null
        const firstClient = Array.from(this.mcpClients.values())[0];
        return firstClient || null;
    }
    
    protected get mcpConnectedSingle(): boolean {
        return this.mcpConnected.size > 0;
    }

    constructor(config: Partial<AgentConfig> = {}) {
        // Валидация minConfidence
        if (config.minConfidence !== undefined) {
            if (config.minConfidence < 0 || config.minConfidence > 1) {
                throw new Error(`Invalid minConfidence: ${config.minConfidence}. Must be between 0 and 1`);
            }
        }

        this.config = {
            name: config.name || 'BaseAgent',
            enabled: config.enabled ?? true,
            minConfidence: config.minConfidence ?? 0.6,
            cacheTTL: config.cacheTTL ?? 5 * 60 * 1000, // 5 минут
            rateLimitPerMinute: config.rateLimitPerMinute ?? 30,
            useNewsSearch: config.useNewsSearch ?? true,
            maxNewsResults: config.maxNewsResults ?? 5
        };

        // Инициализируем Tavily если нужен поиск новостей
        if (this.config.useNewsSearch) {
            try {
                this.tavilyAdapter = new TavilyAdapter();
            } catch {
                console.warn(`⚠️ ${this.config.name}: Tavily adapter not available`);
            }
        }

        // Очистка кэша по таймеру
        this.cleanupInterval = setInterval(() => this.cleanupCache(), 60 * 1000);
    }

    // ==================== АБСТРАКТНЫЕ МЕТОДЫ ====================

    /**
     * Категория агента (sports, politics, crypto, etc.)
     */
    abstract getCategory(): string;

    /**
     * Ключевые слова для фильтрации рынков
     */
    abstract getKeywords(): string[];

    /**
     * Основной метод анализа рынка
     */
    abstract analyze(market: EnrichedMarket, context?: AnalysisContext): Promise<AgentRecommendation>;

    // ==================== ОБЩИЕ МЕТОДЫ ====================

    /**
     * Проверка, подходит ли рынок для этого агента
     */
    matchesCategory(market: EnrichedMarket): boolean {
        const keywords = this.getKeywords();
        const question = market.question.toLowerCase();
        const description = (market.description || '').toLowerCase();

        return keywords.some(kw => {
            const keyword = kw.toLowerCase();
            return question.includes(keyword) || description.includes(keyword);
        });
    }

    /**
     * Анализ рынка с кэшированием и rate limiting
     */
    async analyzeWithCache(market: EnrichedMarket, context?: AnalysisContext): Promise<AgentRecommendation | null> {
        if (!this.config.enabled) {
            return null;
        }

        // Проверяем кэш
        const cached = this.getCached(market.condition_id);
        if (cached) {
            return cached;
        }

        // Rate limiting
        if (!this.checkRateLimit()) {
            console.warn(`⚠️ ${this.config.name}: Rate limit exceeded`);
            return null;
        }

        try {
            // Получаем новости если нужно
            let enrichedContext = context || { timestamp: new Date() };
            if (this.config.useNewsSearch && this.tavilyAdapter) {
                const news = await this.searchNews(market.question);
                enrichedContext = {
                    ...enrichedContext,
                    recentNews: news
                };
            }

            // Выполняем анализ
            const recommendation = await this.analyze(market, enrichedContext);

            // Кэшируем результат
            this.setCache(market.condition_id, recommendation);

            return recommendation;
        } catch (error) {
            console.error(`❌ ${this.config.name}: Analysis failed for ${market.condition_id}:`, error);
            return this.getDefaultRecommendation('Analysis error');
        }
    }

    /**
     * Поиск новостей по теме рынка
     */
    protected async searchNews(query: string): Promise<NewsItem[]> {
        if (!this.tavilyAdapter) {
            return [];
        }

        try {
            const keywords = this.extractSearchKeywords(query);
            const searchQuery = keywords.join(' ');

            const response = await this.tavilyAdapter.quickSearch(
                searchQuery,
                this.config.maxNewsResults
            );

            return response.results.map(r => ({
                title: r.title,
                url: r.url,
                content: r.content,
                publishedDate: r.publishedDate,
                relevanceScore: r.score
            }));
        } catch (error) {
            console.warn(`⚠️ ${this.config.name}: News search failed:`, error);
            return [];
        }
    }

    /**
     * Извлечение ключевых слов из вопроса рынка
     */
    protected extractSearchKeywords(question: string): string[] {
        // Удаляем общие слова
        const stopWords = new Set([
            'will', 'the', 'be', 'a', 'an', 'is', 'are', 'was', 'were',
            'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
            'or', 'and', 'this', 'that', 'these', 'those', 'it', 'its'
        ]);

        const words = question
            .toLowerCase()
            .replace(/[?.,!]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.has(word));

        // Возвращаем первые 5 значимых слов
        return words.slice(0, 5);
    }

    // ==================== MCP ИНТЕГРАЦИЯ ====================

    /**
     * Подключение к MCP серверу с именем
     *
     * Требует установки: npm install @modelcontextprotocol/sdk
     *
     * @param serverName - Имя сервера (например, 'sports', 'politics', 'crypto')
     * @param serverCommand - Команда для запуска MCP сервера
     * @param args - Аргументы команды
     *
     * @example
     * ```typescript
     * // Подключение спортивного MCP сервера
     * await agent.connectMCP('sports', 'npx', ['-y', '@sports-api/mcp-server']);
     * 
     * // Подключение политического MCP сервера
     * await agent.connectMCP('politics', 'npx', ['-y', '@politics-api/mcp-server']);
     * 
     * // Обратная совместимость: без имени (использует 'default')
     * await agent.connectMCP('npx', ['-y', '@anthropic/mcp-server-brave-search']);
     * ```
     */
    async connectMCP(
        serverNameOrCommand: string,
        serverCommandOrArgs?: string | string[],
        args?: string[]
    ): Promise<boolean> {
        // Обратная совместимость: если второй параметр - массив, значит имя не указано
        let serverName: string;
        let serverCommand: string;
        let serverArgs: string[];

        if (Array.isArray(serverCommandOrArgs)) {
            // Старый формат: connectMCP(command, args)
            serverName = 'default';
            serverCommand = serverNameOrCommand;
            serverArgs = serverCommandOrArgs;
        } else if (typeof serverCommandOrArgs === 'string') {
            // Новый формат: connectMCP(name, command, args)
            serverName = serverNameOrCommand;
            serverCommand = serverCommandOrArgs;
            serverArgs = args || [];
        } else {
            // Только команда
            serverName = 'default';
            serverCommand = serverNameOrCommand;
            serverArgs = [];
        }

        // Проверяем, не подключен ли уже сервер с таким именем
        if (this.mcpClients.has(serverName)) {
            console.warn(`⚠️ ${this.config.name}: MCP server "${serverName}" already connected`);
            return true;
        }

        try {
            // Динамический импорт MCP SDK (опционально)
            let mcpSdk: MCPSdkModule | null = null;
            let mcpStdio: MCPStdioModule | null = null;

            try {
                mcpSdk = await import('@modelcontextprotocol/sdk/client/index.js' as string) as unknown as MCPSdkModule;
                mcpStdio = await import('@modelcontextprotocol/sdk/client/stdio.js' as string) as unknown as MCPStdioModule;
            } catch {
                console.warn(`⚠️ ${this.config.name}: MCP SDK not installed. Run: npm install @modelcontextprotocol/sdk`);
                return false;
            }

            if (!mcpSdk || !mcpStdio) {
                return false;
            }

            const { Client } = mcpSdk;
            const { StdioClientTransport } = mcpStdio;

            const transport = new StdioClientTransport({
                command: serverCommand,
                args: serverArgs
            });

            const client = new Client(
                { name: `${this.config.name}-agent-${serverName}`, version: '1.0.0' },
                { capabilities: {} }
            );

            await client.connect(transport);
            
            this.mcpClients.set(serverName, client);
            this.mcpConnected.add(serverName);

            console.warn(`✅ ${this.config.name}: Connected to MCP server "${serverName}"`);
            return true;
        } catch (error) {
            console.warn(`⚠️ ${this.config.name}: MCP connection failed for "${serverName}":`, error);
            return false;
        }
    }

    /**
     * Вызов MCP инструмента на конкретном сервере
     *
     * @param serverName - Имя сервера (если не указано, используется первый подключенный)
     * @param toolName - Имя инструмента
     * @param args - Аргументы инструмента
     *
     * @example
     * ```typescript
     * // Вызов инструмента на конкретном сервере
     * const result = await agent.callMCPTool('sports', 'get_team_stats', { team: 'Lakers' });
     * 
     * // Обратная совместимость: без имени сервера
     * const result = await agent.callMCPTool('search', { query: 'Bitcoin price' });
     * ```
     */
    async callMCPTool(
        serverNameOrToolName: string,
        toolNameOrArgs?: string | Record<string, unknown>,
        args?: Record<string, unknown>
    ): Promise<MCPToolResult | null> {
        let serverName: string | null;
        let toolName: string;
        let toolArgs: Record<string, unknown>;

        // Определяем формат вызова
        if (typeof toolNameOrArgs === 'string') {
            // Новый формат: callMCPTool(serverName, toolName, args)
            serverName = serverNameOrToolName;
            toolName = toolNameOrArgs;
            toolArgs = args || {};
        } else if (toolNameOrArgs && typeof toolNameOrArgs === 'object') {
            // Старый формат: callMCPTool(toolName, args)
            serverName = null; // Используем первый доступный
            toolName = serverNameOrToolName;
            toolArgs = toolNameOrArgs;
        } else {
            console.warn(`⚠️ ${this.config.name}: Invalid MCP tool call format`);
            return null;
        }

        // Выбираем клиент
        let client: MCPClient | undefined;
        if (serverName) {
            client = this.mcpClients.get(serverName);
            if (!client || !this.mcpConnected.has(serverName)) {
                console.warn(`⚠️ ${this.config.name}: MCP server "${serverName}" not connected`);
                return null;
            }
        } else {
            // Используем первый подключенный клиент
            client = Array.from(this.mcpClients.values())[0];
            if (!client) {
                console.warn(`⚠️ ${this.config.name}: No MCP servers connected`);
                return null;
            }
        }

        try {
            const result = await client.callTool({
                name: toolName,
                arguments: toolArgs
            });
            return result;
        } catch (error) {
            console.error(`❌ ${this.config.name}: MCP tool call failed:`, error);
            return null;
        }
    }

    /**
     * Получение списка доступных MCP инструментов
     *
     * @param serverName - Имя сервера (если не указано, возвращает инструменты всех серверов)
     */
    async listMCPTools(serverName?: string): Promise<string[]> {
        if (serverName) {
            // Инструменты конкретного сервера
            const client = this.mcpClients.get(serverName);
            if (!client || !this.mcpConnected.has(serverName)) {
                return [];
            }

            try {
                const tools = await client.listTools();
                return tools.tools?.map((t) => t.name) || [];
            } catch {
                return [];
            }
        } else {
            // Инструменты всех серверов
            const allTools: string[] = [];
            for (const [name, client] of this.mcpClients.entries()) {
                if (this.mcpConnected.has(name)) {
                    try {
                        const tools = await client.listTools();
                        const toolNames = tools.tools?.map((t) => t.name) || [];
                        allTools.push(...toolNames.map((t) => `${name}:${t}`));
                    } catch {
                        // Ignore errors
                    }
                }
            }
            return allTools;
        }
    }

    /**
     * Получение списка подключенных MCP серверов
     */
    getConnectedMCPServers(): string[] {
        return Array.from(this.mcpConnected);
    }

    /**
     * Отключение от MCP сервера
     *
     * @param serverName - Имя сервера (если не указано, отключает все)
     */
    async disconnectMCP(serverName?: string): Promise<void> {
        if (serverName) {
            // Отключаем конкретный сервер
            const client = this.mcpClients.get(serverName);
            if (client && this.mcpConnected.has(serverName)) {
                try {
                    await client.close();
                } catch {
                    // Ignore disconnect errors
                }
                this.mcpClients.delete(serverName);
                this.mcpConnected.delete(serverName);
                console.warn(`✅ ${this.config.name}: Disconnected from MCP server "${serverName}"`);
            }
        } else {
            // Отключаем все серверы
            for (const client of this.mcpClients.values()) {
                try {
                    await client.close();
                } catch {
                    // Ignore disconnect errors
                }
            }
            this.mcpClients.clear();
            this.mcpConnected.clear();
            console.warn(`✅ ${this.config.name}: Disconnected from all MCP servers`);
        }
    }

    // ==================== MCP REGISTRY ИНТЕГРАЦИЯ ====================

    /**
     * Автоматическое подключение рекомендуемых MCP серверов для агента
     *
     * @param maxServers - Максимальное количество серверов для подключения
     *
     * @example
     * ```typescript
     * const agent = new SportsAgent();
     * await agent.initializeRecommendedMCPServers(3); // Подключит топ-3 сервера
     * ```
     */
    async initializeRecommendedMCPServers(maxServers: number = 3): Promise<string[]> {
        const category = this.getCategory();
        const registry = getMCPRegistry();
        const connected: string[] = [];

        // Получаем рекомендуемые серверы для категории агента
        const recommendedNames = AGENT_MCP_CONFIGS[category] || ['tavily', 'fetch'];

        for (const serverName of recommendedNames) {
            if (connected.length >= maxServers) break;

            const serverConfig = registry.getServer(serverName);
            if (!serverConfig) {
                console.warn(`⚠️ ${this.config.name}: Unknown MCP server "${serverName}"`);
                continue;
            }

            // Проверяем доступность сервера
            if (!registry.isServerAvailable(serverName)) {
                const missing = registry.getMissingEnvVars(serverName);
                console.warn(`⚠️ ${this.config.name}: MCP server "${serverName}" unavailable. Missing: ${missing.join(', ')}`);
                continue;
            }

            // Подключаемся
            const success = await this.connectMCPFromConfig(serverConfig);
            if (success) {
                connected.push(serverName);
            }
        }

        console.warn(`📡 ${this.config.name}: Connected to ${connected.length} MCP servers: ${connected.join(', ') || 'none'}`);
        return connected;
    }

    /**
     * Подключение к MCP серверу из конфигурации реестра
     */
    async connectMCPFromConfig(config: MCPServerConfig): Promise<boolean> {
        return this.connectMCP(config.name, config.command, config.args);
    }

    /**
     * Получить список рекомендуемых MCP серверов для агента
     */
    getRecommendedMCPServers(): MCPServerConfig[] {
        const registry = getMCPRegistry();
        return registry.getRecommendedServersForAgent(this.getCategory());
    }

    /**
     * Печать статуса MCP серверов для агента
     */
    printMCPStatus(): void {
        const registry = getMCPRegistry();
        const category = this.getCategory();
        const recommended = registry.getRecommendedServersForAgent(category);
        const connected = this.getConnectedMCPServers();

        console.warn(`\n📡 MCP Status for ${this.config.name} (${category})`);
        console.warn('─'.repeat(50));
        console.warn(`Connected: ${connected.length > 0 ? connected.join(', ') : 'none'}`);
        console.warn(`\nRecommended servers:`);

        for (const server of recommended.slice(0, 5)) {
            const isConnected = connected.includes(server.name);
            const isAvailable = registry.isServerAvailable(server.name);
            let status: string;
            if (isConnected) {
                status = '🟢';
            } else if (isAvailable) {
                status = '🟡';
            } else {
                status = '🔴';
            }
            const freeTag = server.isFree ? '🆓' : '💰';
            console.warn(`  ${status} ${freeTag} ${server.name}: ${server.description.substring(0, 40)}...`);
        }
        console.warn();
    }

    // ==================== КЭШИРОВАНИЕ ====================

    /**
     * Получение из кэша
     */
    protected getCached(key: string): AgentRecommendation | null {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
            return cached.data;
        }
        return null;
    }

    /**
     * Сохранение в кэш
     */
    protected setCache(key: string, data: AgentRecommendation): void {
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    /**
     * Очистка устаревших записей кэша
     */
    protected cleanupCache(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.config.cacheTTL) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Статистика кэша
     */
    getCacheStats(): { size: number; hitRate: number } {
        return {
            size: this.cache.size,
            hitRate: 0 // TODO: трекинг hit/miss
        };
    }

    // ==================== RATE LIMITING ====================

    /**
     * Проверка rate limit
     */
    protected checkRateLimit(): boolean {
        const now = Date.now();
        const windowStart = now - 60 * 1000; // 1 минута

        // Удаляем старые запросы
        this.requestTimestamps = this.requestTimestamps.filter(ts => ts > windowStart);

        // Проверяем лимит
        if (this.requestTimestamps.length >= this.config.rateLimitPerMinute) {
            return false;
        }

        // Добавляем текущий запрос
        this.requestTimestamps.push(now);
        return true;
    }

    // ==================== УТИЛИТЫ ====================

    /**
     * Рекомендация по умолчанию (SKIP)
     */
    protected getDefaultRecommendation(reason: string): AgentRecommendation {
        return {
            action: 'SKIP',
            confidence: 0,
            reasoning: reason,
            sources: []
        };
    }

    /**
     * Расчет edge между рыночной ценой и оценкой агента
     */
    protected calculateEdge(marketPrice: number, estimatedProbability: number): number {
        return estimatedProbability - marketPrice;
    }

    /**
     * Парсит результат MCP поиска (Tavily/Brave) в NewsItem[]
     * Унифицированный метод для всех агентов
     *
     * @param result - Результат от callMCPTool (MCPToolResult | null)
     * @param contentField - Альтернативное поле для content (например, 'description' для Brave)
     */
    protected parseMCPSearchResult(result: MCPToolResult | null, contentField?: string): NewsItem[] {
        if (!result || result.isError) {
            return [];
        }

        // Извлекаем данные из MCP response - может быть в content[0].text (JSON) или content[0].data
        let items: unknown[] = [];
        for (const contentItem of result.content) {
            if (contentItem.type === 'text' && contentItem.text) {
                try {
                    const parsed = JSON.parse(contentItem.text) as unknown;
                    if (Array.isArray(parsed)) {
                        items = parsed;
                    } else if (typeof parsed === 'object' && parsed !== null) {
                        const parsedObj = parsed as Record<string, unknown>;
                        if (parsedObj.results && Array.isArray(parsedObj.results)) {
                            items = parsedObj.results;
                        }
                    }
                } catch {
                    // Не JSON, пропускаем
                }
            } else if (contentItem.data && Array.isArray(contentItem.data)) {
                items = contentItem.data;
            }
        }

        if (items.length === 0) {
            return [];
        }

        return items.map((item: unknown) => {
            const article = item as Record<string, unknown>;

            const title = typeof article.title === 'string' ? article.title : '';

            // Приоритет: content -> snippet -> альтернативное поле
            let content = '';
            if (typeof article.content === 'string') {
                content = article.content;
            } else if (typeof article.snippet === 'string') {
                content = article.snippet;
            } else if (contentField) {
                const fieldValue = article[contentField];
                if (typeof fieldValue === 'string') {
                    content = fieldValue;
                }
            }

            const url = typeof article.url === 'string' ? article.url : '';
            const publishedDate = typeof article.published_date === 'string' ? article.published_date : undefined;
            const source = typeof article.source === 'string' ? article.source : undefined;

            return {
                title,
                content,
                url,
                publishedDate,
                source
            };
        }).filter(item => item.title || item.content); // Фильтруем пустые результаты
    }

    /**
     * Получение текущей цены YES токена
     * Возвращает null если цена недоступна - агент должен SKIP рынок
     */
    protected getYesPrice(market: EnrichedMarket): number | null {
        const yesToken = market.tokens?.find(t => t.outcome === 'Yes');
        if (yesToken?.price === undefined || yesToken?.price === null) {
            console.warn(`⚠️ ${this.config.name}: No YES token price for market ${market.condition_id}`);
            return null;
        }
        return yesToken.price;
    }

    /**
     * Деструктор - очистка ресурсов
     */
    async destroy(): Promise<void> {
        // Очищаем интервал кэша
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
        
        await this.disconnectMCP(); // Отключает все серверы
        this.cache.clear();
        if (this.tavilyAdapter) {
            this.tavilyAdapter.destroy();
        }
    }

    /**
     * Описание агента
     */
    describe(): string {
        const mcpServers = this.getConnectedMCPServers();
        return `${this.config.name} (${this.getCategory()})
- Enabled: ${this.config.enabled}
- Keywords: ${this.getKeywords().join(', ')}
- Min Confidence: ${this.config.minConfidence}
- Cache Size: ${this.cache.size}
- MCP Servers: ${mcpServers.length > 0 ? mcpServers.join(', ') : 'none'}`;
    }
}
