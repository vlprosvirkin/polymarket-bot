/**
 * Тест структуры данных API - проверка поля volume
 * Выясняем почему все рынки показывают $0 объем
 */

import { ClobClient } from "@polymarket/clob-client";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

dotenvConfig({ path: resolve(__dirname, "../../.env") });

async function testVolumeStructure() {
    console.warn("🔍 ПРОВЕРКА СТРУКТУРЫ ДАННЫХ API\n");
    console.warn("=" .repeat(70));

    const client = new ClobClient(
        process.env.CLOB_API_URL || "https://clob.polymarket.com",
        parseInt(process.env.CHAIN_ID || "137")
    );

    try {
        console.warn("\n1️⃣ Получение рынков...");
        const response = await client.getSamplingMarkets();
        const allMarkets = response.data || [];
        console.warn(`   Получено рынков: ${allMarkets.length}`);

        // Фильтруем рынки 80-99%
        const highProbMarkets = allMarkets.filter((m: any) => {
            const yesToken = m.tokens?.find((t: any) => t.outcome === "Yes");
            if (!yesToken) return false;
            return yesToken.price >= 0.80 && yesToken.price <= 0.99;
        });

        console.warn(`   Рынков с 80-99% вероятностью: ${highProbMarkets.length}`);

        // Берем первые 10 рынков для анализа
        const samplesToCheck = Math.min(10, highProbMarkets.length);
        console.warn(`\n2️⃣ Анализ ${samplesToCheck} рынков (RAW JSON):\n`);

        for (let i = 0; i < samplesToCheck; i++) {
            const market = highProbMarkets[i];
            const yesToken = market.tokens?.find((t: any) => t.outcome === "Yes");

            console.warn(`${"─".repeat(70)}`);
            console.warn(`${i + 1}. ${market.question}`);
            console.warn(`${"─".repeat(70)}`);
            console.warn(`Probability: ${(yesToken.price * 100).toFixed(2)}%`);
            console.warn(`\n📊 Volume Fields (RAW):`);
            console.warn(`   market.volume:       ${JSON.stringify(market.volume)}`);
            console.warn(`   market.volume_24hr:  ${JSON.stringify(market.volume_24hr)}`);
            console.warn(`   market.liquidity:    ${JSON.stringify(market.liquidity)}`);

            // Проверяем типы
            console.warn(`\n🔢 Data Types:`);
            console.warn(`   typeof volume:       ${typeof market.volume}`);
            console.warn(`   typeof volume_24hr:  ${typeof market.volume_24hr}`);
            console.warn(`   typeof liquidity:    ${typeof market.liquidity}`);

            // Парсим как мы делаем сейчас
            const parsedVolume = parseFloat(market.volume || "0");
            const parsedVolume24hr = parseFloat(market.volume_24hr || "0");
            const parsedLiquidity = parseFloat(market.liquidity || "0");

            console.warn(`\n💰 Parsed Values:`);
            console.warn(`   volume:       $${parsedVolume.toLocaleString()}`);
            console.warn(`   volume_24hr:  $${parsedVolume24hr.toLocaleString()}`);
            console.warn(`   liquidity:    $${parsedLiquidity.toLocaleString()}`);

            // Проверяем все поля объекта
            console.warn(`\n🔍 All Market Fields:`);
            const allFields = Object.keys(market);
            const volumeRelated = allFields.filter(f =>
                f.toLowerCase().includes('volume') ||
                f.toLowerCase().includes('liquidity') ||
                f.toLowerCase().includes('trade')
            );
            console.warn(`   Volume-related fields: ${JSON.stringify(volumeRelated)}`);
            volumeRelated.forEach(field => {
                console.warn(`      ${field}: ${JSON.stringify(market[field])}`);
            });

            console.warn("\n");
        }

        // Статистика по всем рынкам 80-99%
        console.warn(`\n${"=".repeat(70)}`);
        console.warn(`3️⃣ СТАТИСТИКА ПО ВСЕМ РЫНКАМ 80-99%`);
        console.warn(`${"=".repeat(70)}\n`);

        let withVolume = 0;
        let withVolume24hr = 0;
        let withLiquidity = 0;
        let maxVolume = 0;
        let maxVolume24hr = 0;
        let maxLiquidity = 0;

        highProbMarkets.forEach((m: any) => {
            const vol = parseFloat(m.volume || "0");
            const vol24 = parseFloat(m.volume_24hr || "0");
            const liq = parseFloat(m.liquidity || "0");

            if (vol > 0) {
                withVolume++;
                maxVolume = Math.max(maxVolume, vol);
            }
            if (vol24 > 0) {
                withVolume24hr++;
                maxVolume24hr = Math.max(maxVolume24hr, vol24);
            }
            if (liq > 0) {
                withLiquidity++;
                maxLiquidity = Math.max(maxLiquidity, liq);
            }
        });

        console.warn(`Всего рынков 80-99%: ${highProbMarkets.length}`);
        console.warn(`\nРынков с volume > 0:       ${withVolume} (${((withVolume/highProbMarkets.length)*100).toFixed(1)}%)`);
        console.warn(`   Max volume:              $${maxVolume.toLocaleString()}`);
        console.warn(`\nРынков с volume_24hr > 0:  ${withVolume24hr} (${((withVolume24hr/highProbMarkets.length)*100).toFixed(1)}%)`);
        console.warn(`   Max volume_24hr:         $${maxVolume24hr.toLocaleString()}`);
        console.warn(`\nРынков с liquidity > 0:    ${withLiquidity} (${((withLiquidity/highProbMarkets.length)*100).toFixed(1)}%)`);
        console.warn(`   Max liquidity:           $${maxLiquidity.toLocaleString()}`);

        // Топ-5 по объему
        if (withVolume > 0 || withVolume24hr > 0) {
            console.warn(`\n${"=".repeat(70)}`);
            console.warn(`4️⃣ ТОП-5 РЫНКОВ ПО ОБЪЕМУ`);
            console.warn(`${"=".repeat(70)}\n`);

            const sorted = [...highProbMarkets].sort((a: any, b: any) => {
                const volA = Math.max(parseFloat(a.volume || "0"), parseFloat(a.volume_24hr || "0"));
                const volB = Math.max(parseFloat(b.volume || "0"), parseFloat(b.volume_24hr || "0"));
                return volB - volA;
            });

            for (let i = 0; i < Math.min(5, sorted.length); i++) {
                const m = sorted[i];
                const vol = parseFloat(m.volume || "0");
                const vol24 = parseFloat(m.volume_24hr || "0");
                const liq = parseFloat(m.liquidity || "0");
                const yesToken = m.tokens?.find((t: any) => t.outcome === "Yes");

                console.warn(`${i + 1}. ${m.question}`);
                console.warn(`   Probability: ${(yesToken.price * 100).toFixed(2)}%`);
                console.warn(`   Volume:      $${vol.toLocaleString()}`);
                console.warn(`   Volume 24h:  $${vol24.toLocaleString()}`);
                console.warn(`   Liquidity:   $${liq.toLocaleString()}\n`);
            }
        }

        // Проверяем структуру первого рынка полностью
        console.warn(`\n${"=".repeat(70)}`);
        console.warn(`5️⃣ ПОЛНАЯ СТРУКТУРА ПЕРВОГО РЫНКА (для проверки типов)`);
        console.warn(`${"=".repeat(70)}\n`);

        if (highProbMarkets.length > 0) {
            console.warn(JSON.stringify(highProbMarkets[0], null, 2));
        }

    } catch (error: any) {
        console.error("\n❌ Ошибка:", error.message);
        console.error(error);
    }
}

testVolumeStructure();
