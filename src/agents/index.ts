/**
 * Event Agents - Специализированные агенты для анализа разных типов рынков
 *
 * Агенты предоставляют:
 * - Категоризацию рынков по типу события
 * - Специализированный анализ для каждой категории
 * - MCP интеграцию для доступа к внешним инструментам
 * - Кэширование и rate limiting
 */

// Base
export {
    BaseEventAgent,
    type AgentRecommendation,
    type AnalysisContext,
    type NewsItem,
    type MCPToolResult,
    type AgentConfig
} from './BaseEventAgent';

// Specialized Agents
export { SportsAgent, type SportsAgentConfig } from './SportsAgent';
export { PoliticsAgent, type PoliticsAgentConfig } from './PoliticsAgent';
export { CryptoAgent, type CryptoAgentConfig } from './CryptoAgent';

// MCP Registry
export {
    MCPRegistry,
    getMCPRegistry,
    MCP_SERVERS,
    AGENT_MCP_CONFIGS,
    type MCPServerConfig,
    type MCPCategory
} from './MCPRegistry';

// Agent Registry - для автоматической категоризации
import { BaseEventAgent } from './BaseEventAgent';
import { SportsAgent } from './SportsAgent';
import { PoliticsAgent } from './PoliticsAgent';
import { CryptoAgent } from './CryptoAgent';
import { EnrichedMarket } from '../adapters/polymarket-data.adapter';

/**
 * Реестр агентов
 */
export class AgentRegistry {
    private agents: BaseEventAgent[] = [];

    constructor() {
        // Регистрируем агентов по умолчанию
        this.agents = [
            new SportsAgent(),
            new PoliticsAgent(),
            new CryptoAgent()
        ];
    }

    /**
     * Добавить кастомного агента
     */
    registerAgent(agent: BaseEventAgent): void {
        this.agents.push(agent);
    }

    /**
     * Получить агента для рынка
     */
    getAgentForMarket(market: EnrichedMarket): BaseEventAgent | null {
        for (const agent of this.agents) {
            if (agent.matchesCategory(market)) {
                return agent;
            }
        }
        return null;
    }

    /**
     * Получить всех подходящих агентов для рынка
     */
    getMatchingAgents(market: EnrichedMarket): BaseEventAgent[] {
        return this.agents.filter(agent => agent.matchesCategory(market));
    }

    /**
     * Получить агента по категории
     */
    getAgentByCategory(category: string): BaseEventAgent | null {
        return this.agents.find(agent => agent.getCategory() === category) || null;
    }

    /**
     * Получить все категории
     */
    getCategories(): string[] {
        return this.agents.map(agent => agent.getCategory());
    }

    /**
     * Описание всех агентов
     */
    describe(): string {
        return this.agents.map(agent => agent.describe()).join('\n\n');
    }

    /**
     * Инициализировать MCP серверы для всех агентов
     *
     * @param maxServersPerAgent - Макс. серверов на агента
     */
    async initializeMCPServers(maxServersPerAgent: number = 2): Promise<void> {
        console.warn('\n🚀 Инициализация MCP серверов для всех агентов...\n');

        for (const agent of this.agents) {
            await agent.initializeRecommendedMCPServers(maxServersPerAgent);
        }

        console.warn('✅ MCP инициализация завершена\n');
    }

    /**
     * Печать статуса MCP для всех агентов
     */
    printMCPStatus(): void {
        for (const agent of this.agents) {
            agent.printMCPStatus();
        }
    }

    /**
     * Очистка ресурсов
     */
    async destroy(): Promise<void> {
        for (const agent of this.agents) {
            await agent.destroy();
        }
    }
}

// Singleton instance
let registryInstance: AgentRegistry | null = null;

/**
 * Получить глобальный реестр агентов
 */
export function getAgentRegistry(): AgentRegistry {
    if (!registryInstance) {
        registryInstance = new AgentRegistry();
    }
    return registryInstance;
}
