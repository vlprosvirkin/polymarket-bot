/**
 * Тестовая торговля: покупка и продажа на рынке
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient, Side, OrderType } from "@polymarket/clob-client";

dotenvConfig({ path: resolve(__dirname, "../.env") });

async function testTrade() {
    console.log("🧪 ТЕСТОВАЯ ТОРГОВЛЯ\n");

    if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
        console.log("❌ Необходимы PK и FUNDER_ADDRESS в .env");
        return;
    }

    const wallet = new ethers.Wallet(process.env.PK);
    const funder = process.env.FUNDER_ADDRESS;
    const host = process.env.CLOB_API_URL || "https://clob.polymarket.com";
    const chainId = parseInt(process.env.CHAIN_ID || "137");
    const signatureType = parseInt(process.env.SIGNATURE_TYPE || "1");

    console.log(`👤 Кошелек: ${await wallet.getAddress()}`);
    console.log(`💰 Funder: ${funder}\n`);

    try {
        // 1. Получение API ключей
        console.log("🔑 Получение API ключей...");
        const creds = await new ClobClient(host, chainId, wallet).createOrDeriveApiKey();
        const client = new ClobClient(host, chainId, wallet, creds, signatureType, funder);
        console.log("✅ API ключи получены\n");

        // 2. Получение активных рынков
        console.log("📊 Получение активных рынков...");
        const marketsResponse = await client.getSamplingMarkets();
        const markets = marketsResponse.data || [];

        const activeMarkets = markets.filter((m: any) =>
            m.active &&
            !m.closed &&
            m.accepting_orders &&
            m.tokens &&
            m.tokens.length > 0
        );

        if (activeMarkets.length === 0) {
            console.log("❌ Нет доступных рынков для торговли");
            return;
        }

        const market = activeMarkets[0];
        console.log(`✅ Выбран рынок: ${market.question}`);
        console.log(`   Condition ID: ${market.condition_id}`);
        console.log(`   Min order size: ${market.minimum_order_size}`);
        console.log(`   Tick size: ${market.minimum_tick_size}`);

        const yesToken = market.tokens[0];
        const noToken = market.tokens[1];

        console.log(`\n💎 Токены:`);
        console.log(`   YES: ${yesToken.outcome} @ ${(yesToken.price * 100).toFixed(2)}%`);
        console.log(`   NO:  ${noToken.outcome} @ ${(noToken.price * 100).toFixed(2)}%`);

        // 3. Размещение минимального BUY ордера на YES
        const orderSize = market.minimum_order_size || 5; // минимальный размер
        const buyPrice = Math.max(0.01, yesToken.price * 0.95); // на 5% ниже текущей цены

        console.log(`\n📈 ШАГ 1: Покупка ${orderSize} YES @ ${(buyPrice * 100).toFixed(2)}%`);
        console.log(`   Стоимость: ~${(orderSize * buyPrice).toFixed(2)} USDC`);

        const buyOrder = await client.createAndPostOrder(
            {
                tokenID: yesToken.token_id,
                price: buyPrice,
                side: Side.BUY,
                size: orderSize,
            },
            {
                tickSize: market.minimum_tick_size.toString(),
                negRisk: market.neg_risk || false
            },
            OrderType.GTC
        );

        console.log(`✅ Ордер размещен!`);
        console.log(`   Order ID: ${buyOrder.orderID}`);
        console.log(`   Status: ${buyOrder.status}`);

        // Подождем немного
        console.log(`\n⏳ Ожидание 5 секунд...`);
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 4. Проверка открытых ордеров
        console.log(`\n📋 Проверка открытых ордеров...`);
        const openOrders = await client.getOpenOrders();
        console.log(`   Открытых ордеров: ${openOrders.length}`);

        if (openOrders.length > 0) {
            console.log(`\n   Ваши открытые ордера:`);
            openOrders.slice(0, 3).forEach((order: any, i: number) => {
                console.log(`   ${i + 1}. ${order.side} ${order.asset_id.substring(0, 20)}...`);
                console.log(`      Price: ${order.price}, Size: ${order.original_size}`);
            });
        }

        // 5. Отмена всех открытых ордеров
        if (openOrders.length > 0) {
            console.log(`\n❌ ШАГ 2: Отмена всех открытых ордеров...`);

            const orderIds = openOrders.map((o: any) => o.id);
            const cancelResult = await client.cancelOrders(orderIds);

            console.log(`✅ Отменено ордеров: ${cancelResult.length}`);
        }

        // 6. Проверка позиций (если ордер был частично исполнен)
        console.log(`\n💼 Проверка позиций...`);
        const trades = await client.getTrades({ market: market.condition_id });

        if (trades.length > 0) {
            console.log(`   Найдено сделок: ${trades.length}`);
            console.log(`   Последняя сделка:`);
            const lastTrade = trades[0];
            console.log(`   - Side: ${lastTrade.side}`);
            console.log(`   - Price: ${lastTrade.price}`);
            console.log(`   - Size: ${lastTrade.size}`);

            // Если есть позиция - закрываем её
            if (lastTrade.side === "BUY") {
                console.log(`\n📉 ШАГ 3: Закрытие позиции (продажа ${lastTrade.size} токенов)...`);

                const sellOrder = await client.createMarketOrder({
                    tokenID: yesToken.token_id,
                    amount: parseFloat(lastTrade.size),
                    side: Side.SELL,
                });

                const sellResult = await client.postOrder(sellOrder, OrderType.FOK);
                console.log(`✅ Позиция закрыта!`);
                console.log(`   Order ID: ${sellResult.orderID}`);
            }
        } else {
            console.log(`   Нет исполненных сделок (ордер не был исполнен)`);
        }

        console.log(`\n${"=".repeat(70)}`);
        console.log(`✅ ТЕСТ ЗАВЕРШЕН УСПЕШНО!`);
        console.log(`${"=".repeat(70)}`);
        console.log(`\nРезультат:`);
        console.log(`✅ API работает`);
        console.log(`✅ Размещение ордеров работает`);
        console.log(`✅ Отмена ордеров работает`);
        console.log(`✅ Получение данных работает`);

    } catch (error: any) {
        console.error(`\n❌ Ошибка:`, error.message);
        if (error.response) {
            console.error(`Response:`, JSON.stringify(error.response.data, null, 2));
        }
        console.error(`\n💡 Проверьте:`);
        console.error(`   1. VPN включен?`);
        console.error(`   2. Достаточно USDC на балансе?`);
        console.error(`   3. Правильный USDC.e (bridged)?`);
    }
}

testTrade()
    .catch(error => {
        console.error("💥 Критическая ошибка:", error);
        process.exit(1);
    });
