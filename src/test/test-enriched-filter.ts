/**
 * Тест интеграции MarketFilter + PolymarketDataService
 * Демонстрирует фильтрацию обогащенных рынков с метриками ликвидности
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";
import { PolymarketDataAdapter, EnrichedMarket } from "../adapters/polymarket-data.adapter";
import { MarketFilter } from "../services/MarketFilter";

dotenvConfig({ path: resolve(__dirname, "../../.env") });

async function testEnrichedFilter() {
    console.warn("╔════════════════════════════════════════════════════════════════╗");
    console.warn("║     ТЕСТ ИНТЕГРАЦИИ: MarketFilter + PolymarketDataService     ║");
    console.warn("╚════════════════════════════════════════════════════════════════╝\n");

    // Инициализация
    const client = new ClobClient("https://clob.polymarket.com", 137);
    const dataAdapter = new PolymarketDataAdapter(client);

    console.warn("📡 Получение обогащенных рынков с orderbook и ликвидностью...\n");

    const enrichedMarkets = await dataAdapter.getEnrichedMarkets({
        includeOrderbook: true,
        includeLiquidity: true
    });

    console.warn(`✅ Получено ${enrichedMarkets.length} обогащенных рынков\n`);

    // Тест 1: Статистика по обогащенным рынкам
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("1️⃣  СТАТИСТИКА ПО ОБОГАЩЕННЫМ РЫНКАМ");
    console.warn("═══════════════════════════════════════════════════════════════");

    const stats = MarketFilter.getEnrichedMarketStats(enrichedMarkets);

    console.warn(`   Всего рынков: ${stats.total}`);
    // avgVolume удален - volume не возвращается API
    console.warn(`   Средняя вероятность: ${(stats.avgProbability * 100).toFixed(2)}%`);
    console.warn(`   Средняя ликвидность: $${stats.avgLiquidity.toFixed(2)}`);
    console.warn(`   Средний спред: ${stats.avgSpread.toFixed(2)}%`);
    console.warn(`   С orderbook: ${stats.withOrderbook} (${((stats.withOrderbook / stats.total) * 100).toFixed(1)}%)`);
    console.warn(`   С метриками ликвидности: ${stats.withLiquidity} (${((stats.withLiquidity / stats.total) * 100).toFixed(1)}%)`);
    console.warn();

    // Тест 2: Фильтр по ликвидности
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("2️⃣  ФИЛЬТР ПО ЛИКВИДНОСТИ");
    console.warn("═══════════════════════════════════════════════════════════════");

    const liquidityThresholds = [50, 100, 200, 500];

    for (const threshold of liquidityThresholds) {
        const filtered = MarketFilter.filterEnrichedByLiquidity(enrichedMarkets, threshold);
        console.warn(`   Ликвидность >= $${threshold}: ${filtered.length} рынков`);
    }
    console.warn();

    // Тест 3: Фильтр по спреду
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("3️⃣  ФИЛЬТР ПО СПРЕДУ (BID-ASK SPREAD)");
    console.warn("═══════════════════════════════════════════════════════════════");

    const spreadThresholds = [1, 2, 5, 10];

    for (const threshold of spreadThresholds) {
        const filtered = MarketFilter.filterEnrichedBySpread(enrichedMarkets, threshold);
        console.warn(`   Спред <= ${threshold}%: ${filtered.length} рынков`);
    }
    console.warn();

    // Тест 4: Фильтр по глубине orderbook
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("4️⃣  ФИЛЬТР ПО ГЛУБИНЕ ORDERBOOK");
    console.warn("═══════════════════════════════════════════════════════════════");

    const depths = [3, 5, 10];

    for (const depth of depths) {
        const filtered = MarketFilter.filterEnrichedByOrderbookDepth(enrichedMarkets, depth, depth);
        console.warn(`   Минимум ${depth} bid/ask: ${filtered.length} рынков`);
    }
    console.warn();

    // Тест 5: Комплексная фильтрация для торговли
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("5️⃣  КОМПЛЕКСНАЯ ФИЛЬТРАЦИЯ ДЛЯ ТОРГОВЛИ");
    console.warn("═══════════════════════════════════════════════════════════════");

    const tradableMarkets = MarketFilter.filterEnrichedForTrading(
        enrichedMarkets,
        100,  // minLiquidity
        5,    // maxSpreadPercent
        3     // minOrderbookDepth
    );

    console.warn(`   Конфигурация:`);
    console.warn(`   - Минимальная ликвидность: $100`);
    console.warn(`   - Максимальный спред: 5%`);
    console.warn(`   - Минимальная глубина orderbook: 3 bid/ask`);
    console.warn(`\n   ✅ Найдено ${tradableMarkets.length} ликвидных рынков для торговли\n`);

    if (tradableMarkets.length > 0) {
        console.warn(`   📊 Топ-5 ликвидных рынков:\n`);

        tradableMarkets.slice(0, 5).forEach((market, i) => {
            const yesToken = market.tokens.find(t => t.outcome === 'Yes');
            const prob = yesToken ? (yesToken.price * 100).toFixed(2) : 'N/A';

            const liquidity = market.liquidityMetrics
                ? Math.min(market.liquidityMetrics.totalBidSize, market.liquidityMetrics.totalAskSize).toFixed(2)
                : 'N/A';

            const spread = market.liquidityMetrics
                ? market.liquidityMetrics.spreadPercent.toFixed(2)
                : 'N/A';

            const orderbookDepth = market.orderbook
                ? `${market.orderbook.bids.length}/${market.orderbook.asks.length}`
                : 'N/A';

            const question = market.question.length > 60
                ? market.question.substring(0, 60) + '...'
                : market.question;

            console.warn(`   ${i + 1}. ${question}`);
            console.warn(`      YES: ${prob}% | Liquidity: $${liquidity} | Spread: ${spread}% | Depth: ${orderbookDepth}`);
            console.warn();
        });
    }

    // Тест 6: Pipeline фильтрации для Endgame стратегии
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("6️⃣  PIPELINE ДЛЯ ENDGAME СТРАТЕГИИ");
    console.warn("═══════════════════════════════════════════════════════════════");

    console.warn(`   Шаг 1: Базовая фильтрация`);
    let filteredEnriched = MarketFilter.filterBasic(enrichedMarkets);
    console.warn(`          → ${filteredEnriched.length} активных рынков`);

    console.warn(`   Шаг 2: Фильтр по вероятности (90-99%)`);
    filteredEnriched = MarketFilter.filterByProbability(filteredEnriched, 0.90, 0.99);
    console.warn(`          → ${filteredEnriched.length} рынков`);

    console.warn(`   Шаг 3: Фильтр по дате разрешения (< 14 дней)`);
    filteredEnriched = MarketFilter.filterByResolutionDate(filteredEnriched, undefined, 14);
    console.warn(`          → ${filteredEnriched.length} рынков`);

    console.warn(`   Шаг 4: Фильтр по ликвидности (>$100, <5% spread)`);
    const filteredForTrading = MarketFilter.filterEnrichedForTrading(filteredEnriched, 100, 5, 3);
    console.warn(`          → ${filteredForTrading.length} ликвидных рынков`);

    console.warn(`   Шаг 5: Сортировка по вероятности`);
    // sortByVolume удален - volume не возвращается API. Используем сортировку по вероятности
    const sortedFiltered = MarketFilter.sortByProbability(filteredForTrading, true) as EnrichedMarket[];
    console.warn(`          → Топ-10 рынков`);

    const top10: EnrichedMarket[] = sortedFiltered.slice(0, 10);

    console.warn(`\n   ✅ Финальная выборка для Endgame: ${top10.length} рынков\n`);

    if (top10.length > 0) {
        console.warn(`   📊 Результаты:\n`);

        top10.forEach((market, i) => {
            const yesToken = market.tokens.find(t => t.outcome === 'Yes');
            const prob = yesToken ? (yesToken.price * 100).toFixed(2) : 'N/A';
            const volume = parseFloat(market.volume || '0').toFixed(0);

            const liquidity = market.liquidityMetrics
                ? Math.min(market.liquidityMetrics.totalBidSize, market.liquidityMetrics.totalAskSize).toFixed(2)
                : 'N/A';

            const endDate = market.end_date_iso ? new Date(market.end_date_iso) : null;
            const daysToEnd = endDate
                ? ((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)).toFixed(1)
                : 'N/A';

            const question = market.question.length > 50
                ? market.question.substring(0, 50) + '...'
                : market.question;

            console.warn(`   ${i + 1}. ${question}`);
            console.warn(`      YES: ${prob}% | Volume: $${volume} | Liquidity: $${liquidity} | Days: ${daysToEnd}`);
        });
    }
    console.warn();

    // Итоги
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("✅ ИТОГИ ИНТЕГРАЦИИ");
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn(`✅ Всего обогащенных рынков: ${enrichedMarkets.length}`);
    console.warn(`✅ С метриками ликвидности: ${stats.withLiquidity}`);
    console.warn(`✅ Средняя ликвидность: $${stats.avgLiquidity.toFixed(2)}`);
    console.warn(`✅ Средний спред: ${stats.avgSpread.toFixed(2)}%`);
    console.warn(`✅ Ликвидных для торговли: ${tradableMarkets.length}`);
    console.warn(`✅ Финальная Endgame выборка: ${top10.length}`);
    console.warn("\n🎉 Интеграция MarketFilter + PolymarketDataService работает!\n");
}

// Запуск
testEnrichedFilter().catch(error => {
    console.error("❌ Ошибка:", error);
    process.exit(1);
});
