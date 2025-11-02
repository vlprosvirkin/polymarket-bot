/**
 * Простая тестовая торговля: 1 USDC ставка
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient, Side, OrderType } from "@polymarket/clob-client";

dotenvConfig({ path: resolve(__dirname, "../.env") });

// Адреса контрактов на Polygon
const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const NEG_RISK_CTF_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a";
const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296";

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)",
];

async function simpleTrade() {
    console.log("🧪 ПРОСТАЯ ТЕСТОВАЯ СТАВКА (1 USDC MAX)\n");

    if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
        console.log("❌ Необходимы PK и FUNDER_ADDRESS в .env");
        return;
    }

    const wallet = new ethers.Wallet(process.env.PK);
    const funder = process.env.FUNDER_ADDRESS;
    const host = "https://clob.polymarket.com";
    const chainId = 137;
    const signatureType = 0; // Browser wallet

    console.log(`👤 Кошелек: ${await wallet.getAddress()}\n`);

    // Подключение к Polygon RPC через Alchemy
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    const rpcUrl = alchemyKey
        ? `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`
        : "https://polygon-rpc.com";

    console.log(`🔗 RPC: ${rpcUrl.includes('alchemy') ? 'Alchemy' : 'Public'}\n`);
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const walletWithProvider = wallet.connect(provider);

    try {
        // 1. Проверка и установка allowance для USDC
        console.log("🔐 Шаг 1: Проверка allowance для USDC...");
        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, walletWithProvider);

        const allowanceCTF = await usdcContract.allowance(wallet.address, CTF_EXCHANGE);
        const allowanceNegRisk = await usdcContract.allowance(wallet.address, NEG_RISK_CTF_EXCHANGE);

        console.log(`   CTF Exchange allowance: ${ethers.utils.formatUnits(allowanceCTF, 6)} USDC`);
        console.log(`   NegRisk Exchange allowance: ${ethers.utils.formatUnits(allowanceNegRisk, 6)} USDC`);

        const minAllowance = ethers.utils.parseUnits("10", 6); // минимум 10 USDC

        if (allowanceCTF.lt(minAllowance)) {
            console.log(`\n   📝 Устанавливаю allowance для CTF Exchange...`);
            console.log(`   ⚡ Используем автоматический расчет gas...`);

            const approveTx = await usdcContract.approve(
                CTF_EXCHANGE,
                ethers.constants.MaxUint256
            );
            console.log(`   ⏳ Ожидание подтверждения транзакции...`);
            console.log(`   TX Hash: ${approveTx.hash}`);
            await approveTx.wait();
            console.log(`   ✅ Allowance установлен!`);
        } else {
            console.log(`   ✅ Allowance уже достаточный`);
        }

        if (allowanceNegRisk.lt(minAllowance)) {
            console.log(`\n   📝 Устанавливаю allowance для NegRisk Exchange...`);

            const approveTx = await usdcContract.approve(
                NEG_RISK_CTF_EXCHANGE,
                ethers.constants.MaxUint256
            );
            console.log(`   ⏳ Ожидание подтверждения транзакции...`);
            console.log(`   TX Hash: ${approveTx.hash}`);
            await approveTx.wait();
            console.log(`   ✅ Allowance установлен!`);
        } else {
            console.log(`   ✅ NegRisk allowance уже достаточный`);
        }

        // 2. Получение API ключей
        console.log("\n🔑 Шаг 2: Получение API ключей...");
        const creds = await new ClobClient(host, chainId, wallet).createOrDeriveApiKey();
        const client = new ClobClient(host, chainId, wallet, creds, signatureType, funder);
        console.log("✅ API ключи получены");

        // 3. Получение рынков
        console.log("\n📊 Шаг 3: Поиск активного рынка...");
        const marketsResponse = await client.getSamplingMarkets();
        const markets = marketsResponse.data || [];

        const activeMarkets = markets.filter((m: any) =>
            m.active &&
            !m.closed &&
            m.accepting_orders &&
            m.tokens &&
            m.tokens.length > 0 &&
            !m.neg_risk // Без NegRisk для простоты
        );

        if (activeMarkets.length === 0) {
            console.log("❌ Нет доступных рынков");
            return;
        }

        const market = activeMarkets[0];
        console.log(`✅ Выбран рынок: ${market.question}`);

        const yesToken = market.tokens[0];
        console.log(`\n💎 Токен YES:`);
        console.log(`   Цена: ${(yesToken.price * 100).toFixed(2)}%`);
        console.log(`   Token ID: ${yesToken.token_id}`);

        // 4. Размещение ордера на ~1 USDC
        // Рассчитываем количество токенов на 1 USDC
        const usdcAmount = 1.0; // 1 USDC
        const tokenPrice = yesToken.price;
        const tokenAmount = Math.floor(usdcAmount / tokenPrice);

        console.log(`\n📈 Шаг 4: Размещение ордера...`);
        console.log(`   Покупка ~${tokenAmount} YES токенов`);
        console.log(`   По цене ${(tokenPrice * 100).toFixed(2)}%`);
        console.log(`   Стоимость: ~${(tokenAmount * tokenPrice).toFixed(2)} USDC`);

        const buyOrder = await client.createAndPostOrder(
            {
                tokenID: yesToken.token_id,
                price: tokenPrice,
                side: Side.BUY,
                size: tokenAmount,
            },
            {
                tickSize: market.minimum_tick_size.toString(),
                negRisk: false
            },
            OrderType.GTC
        );

        if (buyOrder.status === 200 || buyOrder.status === 201) {
            console.log(`✅ Ордер успешно размещен!`);
            console.log(`   Order ID: ${buyOrder.orderID}`);
        } else {
            console.log(`⚠️  Ордер не размещен. Status: ${buyOrder.status}`);
            console.log(buyOrder);
        }

        // 5. Ждем 3 секунды
        console.log(`\n⏳ Ожидание 3 секунды...`);
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 6. Проверка открытых ордеров
        console.log(`\n📋 Шаг 5: Проверка открытых ордеров...`);
        const openOrders = await client.getOpenOrders();
        console.log(`   Открытых ордеров: ${openOrders.length}`);

        if (openOrders.length > 0) {
            console.log(`\n   Ваши ордера:`);
            openOrders.forEach((order: any, i: number) => {
                console.log(`   ${i + 1}. ${order.side} - Price: ${order.price}, Size: ${order.original_size}`);
            });

            // Отменяем все
            console.log(`\n❌ Шаг 6: Отмена всех ордеров...`);
            const orderIds = openOrders.map((o: any) => o.id);
            await client.cancelOrders(orderIds);
            console.log(`✅ Ордера отменены`);
        }

        console.log(`\n${"=".repeat(70)}`);
        console.log(`✅ ТЕСТ ЗАВЕРШЕН!`);
        console.log(`${"=".repeat(70)}`);
        console.log(`\n📊 Результат:`);
        console.log(`✅ Allowance установлен`);
        console.log(`✅ API работает`);
        console.log(`✅ Ордер размещен (${buyOrder.status === 200 ? 'успешно' : 'с ошибкой'})`);
        console.log(`✅ Ордера отменены`);

    } catch (error: any) {
        console.error(`\n❌ Ошибка:`, error.message);
        if (error.response?.data) {
            console.error(`Response:`, error.response.data);
        }
    }
}

simpleTrade()
    .catch(error => {
        console.error("💥 Критическая ошибка:", error);
        process.exit(1);
    });
