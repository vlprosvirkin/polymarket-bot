/**
 * Тест интеграции Tavily
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { TavilyAdapter } from '../adapters/tavily.adapter';

dotenvConfig({ path: resolve(__dirname, "../../.env") });

async function testTavily() {
    console.warn('🧪 Testing Tavily Integration\n');

    if (!process.env.TAVILY_API_KEY) {
        console.error('❌ TAVILY_API_KEY not found in .env');
        console.warn('\n📝 To test Tavily:');
        console.warn('1. Get API key from https://tavily.com');
        console.warn('2. Add TAVILY_API_KEY=your_key to .env');
        process.exit(1);
    }

    try {
        const tavily = new TavilyAdapter();

        // Тест 1: Быстрый поиск
        console.warn('📊 Test 1: Quick Search');
        console.warn('Query: "Lakers game tonight"');
        const quickResult = await tavily.quickSearch('Lakers game tonight', 5);
        console.warn(`✅ Found ${quickResult.results.length} results`);
        console.warn(`Response time: ${quickResult.responseTime}ms\n`);

        if (quickResult.results.length > 0) {
            const firstResult = quickResult.results[0];
            if (firstResult) {
                console.warn('Sample result:');
                console.warn(`  Title: ${firstResult.title}`);
                console.warn(`  URL: ${firstResult.url}`);
                console.warn(`  Content: ${firstResult.content.substring(0, 100)}...\n`);
            }
        }

        // Тест 2: Глубокий поиск
        console.warn('🔬 Test 2: Deep Search');
        console.warn('Query: "Bitcoin price prediction 2024"');
        const deepResult = await tavily.deepSearch('Bitcoin price prediction 2024');
        console.warn(`✅ Found ${deepResult.results.length} results`);
        
        if (deepResult.answer) {
            console.warn(`\n📝 Tavily Answer:\n${deepResult.answer}\n`);
        }

        // Тест 3: Форматирование для промпта
        console.warn('📝 Test 3: Format for AI Prompt');
        const formatted = tavily.formatResultsForPrompt(deepResult);
        console.warn(`Formatted length: ${formatted.length} chars`);
        console.warn('\nSample formatted output:');
        console.warn(formatted.substring(0, 500) + '...\n');

        console.warn('✅ All Tavily tests passed!');

    } catch (error: any) {
        console.error('❌ Tavily test failed:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
        process.exit(1);
    }
}

testTavily();

