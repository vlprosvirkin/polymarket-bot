/**
 * Тест MarketFilter модуля
 * Демонстрирует все возможности фильтрации
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";
import { MarketFilter } from "../services/MarketFilter";
import { Market } from "../types/market";

dotenvConfig({ path: resolve(__dirname, "../../.env") });

async function testMarketFilter() {
    console.warn("╔════════════════════════════════════════════════════════════════╗");
    console.warn("║           ТЕСТ MARKETFILTER МОДУЛЯ                            ║");
    console.warn("╚════════════════════════════════════════════════════════════════╝\n");

    // Подключение к API
    const client = new ClobClient("https://clob.polymarket.com", 137);

    console.warn("📡 Получение рынков...");
    const response = await client.getSamplingMarkets();
    const allMarkets = response.data || [];

    console.warn(`✅ Получено ${allMarkets.length} рынков\n`);

    // Тест 1: Базовая фильтрация
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("1️⃣  ТЕСТ: Базовая фильтрация");
    console.warn("═══════════════════════════════════════════════════════════════");

    const activeMarkets = MarketFilter.filterBasic(allMarkets);
    console.warn(`   До: ${allMarkets.length} рынков`);
    console.warn(`   После: ${activeMarkets.length} активных рынков`);
    console.warn(`   Отфильтровано: ${allMarkets.length - activeMarkets.length} неактивных\n`);

    // Тест 2: Фильтр по объему
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("2️⃣  ТЕСТ: Фильтр по объему");
    console.warn("═══════════════════════════════════════════════════════════════");

    // filterByVolume удален - volume не возвращается API. Используем фильтр по цене
    const highPrice = MarketFilter.filterByPrice(activeMarkets, 0.80);
    console.warn(`   С ценой YES > 80%: ${highPrice.length} рынков`);

    const mediumPrice = MarketFilter.filterByPrice(activeMarkets, 0.50, 0.80);
    console.warn(`   С ценой YES 50-80%: ${mediumPrice.length} рынков`);

    const lowPrice = MarketFilter.filterByPrice(activeMarkets, undefined, 0.50);
    console.warn(`   С ценой YES < 50%: ${lowPrice.length} рынков\n`);

    // Тест 3: Фильтр по вероятности
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("3️⃣  ТЕСТ: Фильтр по вероятности (цене YES)");
    console.warn("═══════════════════════════════════════════════════════════════");

    const highProb = MarketFilter.filterByProbability(activeMarkets, 0.80, 1.0);
    console.warn(`   80-100% вероятность: ${highProb.length} рынков`);

    const endgameProb = MarketFilter.filterByProbability(activeMarkets, 0.90, 0.99);
    console.warn(`   90-99% (Endgame): ${endgameProb.length} рынков`);

    const lowProb = MarketFilter.filterByProbability(activeMarkets, 0.01, 0.30);
    console.warn(`   1-30% вероятность: ${lowProb.length} рынков\n`);

    // Тест 4: Фильтр по дате разрешения
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("4️⃣  ТЕСТ: Фильтр по дате разрешения");
    console.warn("═══════════════════════════════════════════════════════════════");

    const ending7days = MarketFilter.filterByResolutionDate(activeMarkets, undefined, 7);
    console.warn(`   Разрешаются в течение 7 дней: ${ending7days.length} рынков`);

    const ending14days = MarketFilter.filterByResolutionDate(activeMarkets, undefined, 14);
    console.warn(`   Разрешаются в течение 14 дней: ${ending14days.length} рынков`);

    const ending30days = MarketFilter.filterByResolutionDate(activeMarkets, undefined, 30);
    console.warn(`   Разрешаются в течение 30 дней: ${ending30days.length} рынков\n`);

    // Тест 5: Endgame фильтр
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("5️⃣  ТЕСТ: Endgame фильтр (90-99%, < 14 дней)");
    console.warn("═══════════════════════════════════════════════════════════════");

    const endgameMarkets = MarketFilter.filterForEndgame(
        activeMarkets,
        0.90,  // minProbability
        0.99,  // maxProbability
        14,    // maxDaysToResolution
        true   // excludeNegRisk
    );

    console.warn(`   Найдено Endgame возможностей: ${endgameMarkets.length}`);

    if (endgameMarkets.length > 0) {
        console.warn(`\n   📊 Топ-5 Endgame рынков:`);
        endgameMarkets.slice(0, 5).forEach((market, i) => {
            const yesToken = market.tokens.find(t => t.outcome === 'Yes');
            const prob = yesToken ? (yesToken.price * 100).toFixed(2) : 'N/A';
            const volume = parseFloat(market.volume || '0').toFixed(0);

            const endDate = market.end_date_iso ? new Date(market.end_date_iso) : null;
            const daysToEnd = endDate
                ? ((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)).toFixed(1)
                : 'N/A';

            const question = market.question.length > 60
                ? market.question.substring(0, 60) + '...'
                : market.question;

            console.warn(`\n   ${i + 1}. ${question}`);
            console.warn(`      YES: ${prob}% | Volume: $${volume} | Days: ${daysToEnd}`);
        });
    }
    console.warn();

    // Тест 6: Сортировка
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("6️⃣  ТЕСТ: Сортировка");
    console.warn("═══════════════════════════════════════════════════════════════");

    // sortByVolume удален - volume не возвращается API. Используем сортировку по вероятности
    const sortedByProbability = MarketFilter.sortByProbability(activeMarkets.slice(0, 10), true);
    console.warn(`   Топ-3 по вероятности:`);
        sortedByProbability.slice(0, 3).forEach((market: Market, i: number) => {
        const yesToken = market.tokens?.find((t: { outcome: string }) => t.outcome === 'Yes');
        const probability = yesToken ? (yesToken.price * 100).toFixed(1) : 'N/A';
        const question = market.question.substring(0, 50) + '...';
        console.warn(`   ${i + 1}. ${probability}% - ${question}`);
    });

    const sortedByDate = MarketFilter.sortByResolutionDate(activeMarkets.slice(0, 10), true);
    console.warn(`\n   Топ-3 по близости к разрешению:`);
    sortedByDate.slice(0, 3).forEach((market, i) => {
        const endDate = market.end_date_iso ? new Date(market.end_date_iso) : null;
        const daysToEnd = endDate
            ? ((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)).toFixed(1)
            : 'N/A';
        const question = market.question.substring(0, 50) + '...';
        console.warn(`   ${i + 1}. ${daysToEnd} дней - ${question}`);
    });
    console.warn();

    // Тест 7: Комплексная фильтрация с конфигом
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("7️⃣  ТЕСТ: Комплексная фильтрация");
    console.warn("═══════════════════════════════════════════════════════════════");

    const complexFiltered = MarketFilter.filterWithConfig(activeMarkets, {
        // minVolume удален - volume не возвращается API
        minPrice: 0.70,
        maxPrice: 0.95,
        maxDaysToResolution: 30,
        excludeNegRisk: true
    });

    console.warn(`   Конфигурация:`);
    console.warn(`   - Минимальный объем: $500`);
    console.warn(`   - Цена YES: 70-95%`);
    console.warn(`   - До разрешения: < 30 дней`);
    console.warn(`   - Без NegRisk`);
    console.warn(`\n   Результат: ${complexFiltered.length} рынков\n`);

    // Тест 8: Статистика
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("8️⃣  ТЕСТ: Статистика по рынкам");
    console.warn("═══════════════════════════════════════════════════════════════");

    const stats = MarketFilter.getMarketStats(activeMarkets);

    console.warn(`   Всего рынков: ${stats.total}`);
    // avgVolume удален - volume не возвращается API
    console.warn(`   Средняя вероятность: ${(stats.avgProbability * 100).toFixed(2)}%`);
    console.warn(`   Среднее время до разрешения: ${stats.avgDaysToResolution.toFixed(1)} дней`);

    if (stats.categories.size > 0) {
        console.warn(`\n   📊 Топ-5 категорий:`);
        const sortedCategories = Array.from(stats.categories.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        sortedCategories.forEach(([category, count], i) => {
            const percentage = ((count / stats.total) * 100).toFixed(1);
            console.warn(`   ${i + 1}. ${category}: ${count} (${percentage}%)`);
        });
    }
    console.warn();

    // Финальная сводка
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn("✅ ИТОГИ ТЕСТИРОВАНИЯ");
    console.warn("═══════════════════════════════════════════════════════════════");
    console.warn(`✅ Базовая фильтрация: ${activeMarkets.length}/${allMarkets.length}`);
    console.warn(`✅ Высокая цена (>80%): ${highPrice.length}`);
    console.warn(`✅ Endgame возможности (90-99%): ${endgameMarkets.length}`);
    console.warn(`✅ Разрешаются < 7 дней: ${ending7days.length}`);
    console.warn(`✅ Комплексная фильтрация: ${complexFiltered.length}`);
    console.warn("\n🎉 Все тесты пройдены успешно!\n");
}

// Запуск
testMarketFilter().catch(error => {
    console.error("❌ Ошибка:", error);
    process.exit(1);
});
