/**
 * MCPRegistry - Реестр MCP серверов для агентов
 *
 * Централизованное управление подключениями к MCP серверам.
 * Поддерживает различные категории: поиск, новости, крипто, спорт, финансы.
 *
 * @see https://github.com/modelcontextprotocol/servers
 * @see https://github.com/punkpeye/awesome-mcp-servers
 */

/**
 * Конфигурация MCP сервера
 */
export interface MCPServerConfig {
    /** Уникальное имя сервера */
    name: string;
    /** Описание */
    description: string;
    /** Команда для запуска */
    command: string;
    /** Аргументы команды */
    args: string[];
    /** Категории использования */
    categories: MCPCategory[];
    /** Требуемые переменные окружения */
    requiredEnvVars?: string[];
    /** Опциональные переменные окружения */
    optionalEnvVars?: string[];
    /** URL документации */
    docsUrl?: string;
    /** Бесплатный ли сервер */
    isFree: boolean;
    /** Приоритет (выше = предпочтительнее) */
    priority: number;
}

/**
 * Категории MCP серверов
 */
export type MCPCategory =
    | 'search'      // Веб-поиск
    | 'news'        // Новости
    | 'crypto'      // Криптовалюты
    | 'sports'      // Спорт
    | 'finance'     // Финансы
    | 'politics'    // Политика
    | 'web'         // Веб-скрапинг
    | 'data'        // Общие данные
    | 'ai';         // AI-инструменты

/**
 * Реестр доступных MCP серверов
 */
export const MCP_SERVERS: MCPServerConfig[] = [
    // ==================== ПОИСК ====================
    {
        name: 'brave-search',
        description: 'Brave Search API - веб, новости, изображения, видео поиск',
        command: 'npx',
        args: ['-y', '@anthropic/mcp-server-brave-search'],
        categories: ['search', 'news', 'web'],
        requiredEnvVars: ['BRAVE_API_KEY'],
        docsUrl: 'https://github.com/brave/brave-search-mcp-server',
        isFree: false, // Требует API ключ (есть бесплатный tier)
        priority: 90
    },
    {
        name: 'tavily',
        description: 'Tavily - AI-оптимизированный поиск с извлечением контента',
        command: 'npx',
        args: ['-y', 'tavily-mcp'],
        categories: ['search', 'news', 'web', 'ai'],
        requiredEnvVars: ['TAVILY_API_KEY'],
        docsUrl: 'https://tavily.com/',
        isFree: false, // Есть бесплатный tier (1000 запросов/месяц)
        priority: 95
    },
    {
        name: 'omnisearch',
        description: 'Unified search: Tavily, Brave, Perplexity, Kagi, Jina AI',
        command: 'npx',
        args: ['-y', 'mcp-omnisearch'],
        categories: ['search', 'news', 'web', 'ai'],
        optionalEnvVars: ['TAVILY_API_KEY', 'BRAVE_API_KEY', 'PERPLEXITY_API_KEY', 'KAGI_API_KEY'],
        docsUrl: 'https://github.com/spences10/mcp-omnisearch',
        isFree: false,
        priority: 85
    },
    {
        name: 'web-search-free',
        description: 'Бесплатный веб-поиск через Google (без API ключа)',
        command: 'npx',
        args: ['-y', '@pskill9/web-search'],
        categories: ['search', 'web'],
        docsUrl: 'https://github.com/pskill9/web-search',
        isFree: true,
        priority: 70
    },

    // ==================== КРИПТОВАЛЮТЫ ====================
    {
        name: 'coingecko',
        description: 'CoinGecko - цены, market cap, volume для 15k+ криптовалют',
        command: 'npx',
        args: ['-y', '@anthropic/mcp-server-coingecko'],
        categories: ['crypto', 'finance', 'data'],
        optionalEnvVars: ['COINGECKO_API_KEY'], // Без ключа работает с лимитами
        docsUrl: 'https://docs.coingecko.com/reference/mcp-server',
        isFree: true, // Публичный доступ с лимитами
        priority: 95
    },
    {
        name: 'coingecko-pro',
        description: 'CoinGecko Pro - расширенные данные с Pro API ключом',
        command: 'npx',
        args: ['-y', 'coingecko-mcp-pro'],
        categories: ['crypto', 'finance', 'data'],
        requiredEnvVars: ['COINGECKO_PRO_API_KEY'],
        docsUrl: 'https://www.coingecko.com/en/api',
        isFree: false,
        priority: 98
    },
    {
        name: 'armor-crypto',
        description: 'DeFi, swaps, bridging, wallet management',
        command: 'npx',
        args: ['-y', 'armor-crypto-mcp'],
        categories: ['crypto', 'finance'],
        docsUrl: 'https://github.com/anthropics/armor-crypto-mcp',
        isFree: true,
        priority: 80
    },
    {
        name: 'bankless-onchain',
        description: 'Onchain data: ERC20 tokens, transaction history',
        command: 'npx',
        args: ['-y', 'bankless-onchain-mcp'],
        categories: ['crypto', 'data'],
        docsUrl: 'https://github.com/bankless/onchain-mcp',
        isFree: true,
        priority: 75
    },

    // ==================== ФИНАНСЫ ====================
    {
        name: 'alphavantage',
        description: 'Alpha Vantage - акции, форекс, криптовалюты, экономические индикаторы',
        command: 'npx',
        args: ['-y', 'alphavantage-mcp'],
        categories: ['finance', 'crypto', 'data'],
        requiredEnvVars: ['ALPHAVANTAGE_API_KEY'],
        docsUrl: 'https://www.alphavantage.co/',
        isFree: false, // Есть бесплатный tier (25 запросов/день)
        priority: 85
    },
    {
        name: 'alpaca',
        description: 'Alpaca Trading - акции, опционы, рыночные данные',
        command: 'npx',
        args: ['-y', 'alpaca-mcp'],
        categories: ['finance', 'data'],
        requiredEnvVars: ['ALPACA_API_KEY', 'ALPACA_SECRET_KEY'],
        docsUrl: 'https://alpaca.markets/',
        isFree: false,
        priority: 80
    },

    // ==================== ВЕБ-СКРАПИНГ ====================
    {
        name: 'fetch',
        description: 'Официальный MCP Fetch - загрузка и конвертация веб-контента',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-fetch'],
        categories: ['web', 'data'],
        docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
        isFree: true,
        priority: 90
    },
    {
        name: 'browserbase',
        description: 'Cloud browser automation для веб-скрапинга',
        command: 'npx',
        args: ['-y', '@browserbase/mcp-server'],
        categories: ['web', 'data'],
        requiredEnvVars: ['BROWSERBASE_API_KEY'],
        docsUrl: 'https://browserbase.com/',
        isFree: false,
        priority: 75
    },
    {
        name: 'playwright',
        description: 'Microsoft Playwright - веб-автоматизация',
        command: 'npx',
        args: ['-y', '@anthropic/mcp-server-playwright'],
        categories: ['web', 'data'],
        docsUrl: 'https://playwright.dev/',
        isFree: true,
        priority: 85
    },
    {
        name: 'apify',
        description: 'Apify - 6000+ готовых скраперов для соцсетей, e-commerce, поиска',
        command: 'npx',
        args: ['-y', 'apify-mcp'],
        categories: ['web', 'data', 'news'],
        requiredEnvVars: ['APIFY_TOKEN'],
        docsUrl: 'https://apify.com/',
        isFree: false, // Есть бесплатный tier
        priority: 80
    },

    // ==================== НОВОСТИ И ДАННЫЕ ====================
    {
        name: 'rss',
        description: 'RSS/Atom feed reader для новостных источников',
        command: 'npx',
        args: ['-y', 'mcp-rss'],
        categories: ['news', 'data'],
        docsUrl: 'https://github.com/anthropics/mcp-rss',
        isFree: true,
        priority: 80
    },
    {
        name: 'tako',
        description: 'Tako - финансы, спорт, погода, публичные данные в реальном времени',
        command: 'npx',
        args: ['-y', 'tako-mcp'],
        categories: ['finance', 'sports', 'data', 'news'],
        docsUrl: 'https://tako.ai/',
        isFree: true,
        priority: 85
    },

    // ==================== ОБЩИЕ ИНСТРУМЕНТЫ ====================
    {
        name: 'memory',
        description: 'Knowledge graph - персистентная память агента',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        categories: ['data', 'ai'],
        docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
        isFree: true,
        priority: 70
    },
    {
        name: 'sequential-thinking',
        description: 'Динамическое решение проблем через последовательные размышления',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
        categories: ['ai'],
        docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
        isFree: true,
        priority: 65
    }
];

/**
 * MCPRegistry - Класс для управления MCP серверами
 */
export class MCPRegistry {
    private servers: Map<string, MCPServerConfig> = new Map();

    constructor() {
        // Загружаем все серверы в Map для быстрого доступа
        for (const server of MCP_SERVERS) {
            this.servers.set(server.name, server);
        }
    }

    /**
     * Получить сервер по имени
     */
    getServer(name: string): MCPServerConfig | undefined {
        return this.servers.get(name);
    }

    /**
     * Получить все серверы
     */
    getAllServers(): MCPServerConfig[] {
        return Array.from(this.servers.values());
    }

    /**
     * Получить серверы по категории
     */
    getServersByCategory(category: MCPCategory): MCPServerConfig[] {
        return MCP_SERVERS
            .filter(s => s.categories.includes(category))
            .sort((a, b) => b.priority - a.priority);
    }

    /**
     * Получить только бесплатные серверы
     */
    getFreeServers(): MCPServerConfig[] {
        return MCP_SERVERS
            .filter(s => s.isFree)
            .sort((a, b) => b.priority - a.priority);
    }

    /**
     * Получить серверы, доступные с текущими ENV переменными
     */
    getAvailableServers(): MCPServerConfig[] {
        return MCP_SERVERS.filter(server => {
            // Если нет обязательных переменных - сервер доступен
            if (!server.requiredEnvVars || server.requiredEnvVars.length === 0) {
                return true;
            }
            // Проверяем наличие всех обязательных переменных
            return server.requiredEnvVars.every(envVar => process.env[envVar]);
        }).sort((a, b) => b.priority - a.priority);
    }

    /**
     * Получить лучший сервер для категории (с учетом доступности)
     */
    getBestServerForCategory(category: MCPCategory): MCPServerConfig | undefined {
        const available = this.getAvailableServers();
        return available.find(s => s.categories.includes(category));
    }

    /**
     * Проверить, доступен ли сервер
     */
    isServerAvailable(name: string): boolean {
        const server = this.servers.get(name);
        if (!server) return false;

        if (!server.requiredEnvVars || server.requiredEnvVars.length === 0) {
            return true;
        }

        return server.requiredEnvVars.every(envVar => process.env[envVar]);
    }

    /**
     * Получить недостающие переменные окружения для сервера
     */
    getMissingEnvVars(name: string): string[] {
        const server = this.servers.get(name);
        if (!server || !server.requiredEnvVars) return [];

        return server.requiredEnvVars.filter(envVar => !process.env[envVar]);
    }

    /**
     * Получить рекомендуемые серверы для агента по категории
     */
    getRecommendedServersForAgent(agentCategory: string): MCPServerConfig[] {
        const categoryMap: Record<string, MCPCategory[]> = {
            'sports': ['sports', 'news', 'search', 'data'],
            'politics': ['news', 'search', 'web', 'data'],
            'crypto': ['crypto', 'finance', 'news', 'search']
        };

        const categories = categoryMap[agentCategory] || ['search', 'data'];
        const recommended = new Set<MCPServerConfig>();

        for (const category of categories) {
            const servers = this.getServersByCategory(category);
            for (const server of servers.slice(0, 3)) { // Топ 3 для каждой категории
                recommended.add(server);
            }
        }

        return Array.from(recommended).sort((a, b) => b.priority - a.priority);
    }

    /**
     * Печать статуса всех серверов
     */
    printStatus(): void {
        console.warn('\n╔════════════════════════════════════════════════════════════════╗');
        console.warn('║                    MCP SERVERS STATUS                          ║');
        console.warn('╚════════════════════════════════════════════════════════════════╝\n');

        const categories: MCPCategory[] = ['search', 'news', 'crypto', 'finance', 'sports', 'web', 'data', 'ai'];

        for (const category of categories) {
            const servers = this.getServersByCategory(category);
            if (servers.length === 0) continue;

            console.warn(`📁 ${category.toUpperCase()}`);
            console.warn('─'.repeat(60));

            for (const server of servers) {
                const available = this.isServerAvailable(server.name);
                const status = available ? '✅' : '❌';
                const freeTag = server.isFree ? '🆓' : '💰';
                const missing = this.getMissingEnvVars(server.name);

                console.warn(`   ${status} ${freeTag} ${server.name.padEnd(20)} P:${server.priority}`);
                if (!available && missing.length > 0) {
                    console.warn(`      └─ Missing: ${missing.join(', ')}`);
                }
            }
            console.warn();
        }
    }
}

// Singleton instance
let registryInstance: MCPRegistry | null = null;

/**
 * Получить singleton экземпляр MCPRegistry
 */
export function getMCPRegistry(): MCPRegistry {
    if (!registryInstance) {
        registryInstance = new MCPRegistry();
    }
    return registryInstance;
}

/**
 * Конфигурации серверов для каждого типа агента
 */
export const AGENT_MCP_CONFIGS: Record<string, string[]> = {
    sports: ['tako', 'tavily', 'brave-search', 'web-search-free', 'fetch'],
    politics: ['tavily', 'brave-search', 'rss', 'fetch', 'web-search-free'],
    crypto: ['coingecko', 'tavily', 'armor-crypto', 'alphavantage', 'fetch']
};
