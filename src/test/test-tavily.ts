/**
 * Тест интеграции Tavily
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { TavilyService } from '../services/tavily.service';

dotenvConfig({ path: resolve(__dirname, "../../.env") });

async function testTavily() {
    console.log('🧪 Testing Tavily Integration\n');

    if (!process.env.TAVILY_API_KEY) {
        console.error('❌ TAVILY_API_KEY not found in .env');
        console.log('\n📝 To test Tavily:');
        console.log('1. Get API key from https://tavily.com');
        console.log('2. Add TAVILY_API_KEY=your_key to .env');
        process.exit(1);
    }

    try {
        const tavily = new TavilyService();

        // Тест 1: Быстрый поиск
        console.log('📊 Test 1: Quick Search');
        console.log('Query: "Lakers game tonight"');
        const quickResult = await tavily.quickSearch('Lakers game tonight', 5);
        console.log(`✅ Found ${quickResult.results.length} results`);
        console.log(`Response time: ${quickResult.responseTime}ms\n`);

        if (quickResult.results.length > 0) {
            const firstResult = quickResult.results[0];
            if (firstResult) {
                console.log('Sample result:');
                console.log(`  Title: ${firstResult.title}`);
                console.log(`  URL: ${firstResult.url}`);
                console.log(`  Content: ${firstResult.content.substring(0, 100)}...\n`);
            }
        }

        // Тест 2: Глубокий поиск
        console.log('🔬 Test 2: Deep Search');
        console.log('Query: "Bitcoin price prediction 2024"');
        const deepResult = await tavily.deepSearch('Bitcoin price prediction 2024');
        console.log(`✅ Found ${deepResult.results.length} results`);
        
        if (deepResult.answer) {
            console.log(`\n📝 Tavily Answer:\n${deepResult.answer}\n`);
        }

        // Тест 3: Форматирование для промпта
        console.log('📝 Test 3: Format for AI Prompt');
        const formatted = tavily.formatResultsForPrompt(deepResult);
        console.log(`Formatted length: ${formatted.length} chars`);
        console.log('\nSample formatted output:');
        console.log(formatted.substring(0, 500) + '...\n');

        console.log('✅ All Tavily tests passed!');

    } catch (error: any) {
        console.error('❌ Tavily test failed:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
        process.exit(1);
    }
}

testTavily();

