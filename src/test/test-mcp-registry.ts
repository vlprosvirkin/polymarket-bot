/**
 * Тест MCP Registry - проверка доступности серверов
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { getMCPRegistry, getAgentRegistry } from "../agents";

dotenvConfig({ path: resolve(__dirname, "../../.env") });

async function testMCPRegistry() {
    console.warn(`
╔════════════════════════════════════════════════════════════════╗
║                    MCP REGISTRY TEST                           ║
╚════════════════════════════════════════════════════════════════╝
`);

    const mcpRegistry = getMCPRegistry();

    // 1. Показываем статус всех серверов
    mcpRegistry.printStatus();

    // 2. Показываем доступные серверы (с ENV переменными)
    console.warn('═══════════════════════════════════════════════════════════════');
    console.warn('🟢 ДОСТУПНЫЕ СЕРВЕРЫ (ENV переменные настроены)');
    console.warn('═══════════════════════════════════════════════════════════════\n');

    const available = mcpRegistry.getAvailableServers();
    if (available.length === 0) {
        console.warn('   Нет доступных серверов. Настройте API ключи в .env\n');
    } else {
        for (const server of available) {
            const freeTag = server.isFree ? '🆓' : '💰';
            console.warn(`   ${freeTag} ${server.name.padEnd(20)} - ${server.description.substring(0, 50)}...`);
        }
        console.warn();
    }

    // 3. Рекомендуемые серверы для каждого агента
    console.warn('═══════════════════════════════════════════════════════════════');
    console.warn('📋 РЕКОМЕНДУЕМЫЕ СЕРВЕРЫ ПО АГЕНТАМ');
    console.warn('═══════════════════════════════════════════════════════════════\n');

    const categories = ['sports', 'politics', 'crypto'];
    for (const category of categories) {
        console.warn(`   📁 ${category.toUpperCase()}`);
        const recommended = mcpRegistry.getRecommendedServersForAgent(category);
        for (const server of recommended.slice(0, 5)) {
            const isAvailable = mcpRegistry.isServerAvailable(server.name);
            const status = isAvailable ? '✅' : '❌';
            const freeTag = server.isFree ? '🆓' : '💰';
            console.warn(`      ${status} ${freeTag} ${server.name}`);
        }
        console.warn();
    }

    // 4. Тестируем AgentRegistry с MCP
    console.warn('═══════════════════════════════════════════════════════════════');
    console.warn('🤖 СТАТУС АГЕНТОВ');
    console.warn('═══════════════════════════════════════════════════════════════\n');

    const agentRegistry = getAgentRegistry();
    agentRegistry.printMCPStatus();

    // 5. Подсказки по настройке
    console.warn('═══════════════════════════════════════════════════════════════');
    console.warn('💡 ПОДСКАЗКИ ПО НАСТРОЙКЕ');
    console.warn('═══════════════════════════════════════════════════════════════\n');

    const allServers = mcpRegistry.getAllServers();
    const unavailableWithKeys = allServers.filter(s =>
        !mcpRegistry.isServerAvailable(s.name) &&
        s.requiredEnvVars &&
        s.requiredEnvVars.length > 0
    );

    if (unavailableWithKeys.length > 0) {
        console.warn('   Добавьте следующие переменные в .env для разблокировки серверов:\n');
        const envVars = new Set<string>();
        for (const server of unavailableWithKeys) {
            for (const envVar of server.requiredEnvVars || []) {
                if (!process.env[envVar]) {
                    envVars.add(envVar);
                }
            }
        }
        for (const envVar of envVars) {
            console.warn(`   ${envVar}=your_api_key_here`);
        }
        console.warn();
    }

    // Ссылки на документацию
    console.warn('   📚 Документация по API ключам:');
    console.warn('   • Tavily: https://tavily.com/ (1000 запросов/месяц бесплатно)');
    console.warn('   • Brave Search: https://brave.com/search/api/ (2000 запросов/месяц бесплатно)');
    console.warn('   • CoinGecko: https://www.coingecko.com/en/api (бесплатно с лимитами)');
    console.warn('   • Alpha Vantage: https://www.alphavantage.co/ (25 запросов/день бесплатно)');
    console.warn();

    // Cleanup
    await agentRegistry.destroy();
    console.warn('✅ Тест завершен\n');
}

testMCPRegistry().catch(error => {
    console.error('❌ Ошибка:', error);
    process.exit(1);
});
