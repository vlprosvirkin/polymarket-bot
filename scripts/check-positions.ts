/**
 * Скрипт для проверки текущих позиций
 * Показывает открытые ордера, историю сделок и балансы токенов
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";

dotenvConfig({ path: resolve(__dirname, "../.env") });

interface Position {
    market: string;
    question: string;
    tokenId: string;
    outcome: string;
    balance: number;
    price: number;
    value: number;
}

async function checkPositions() {
    console.log("🔍 ПРОВЕРКА ТЕКУЩИХ ПОЗИЦИЙ\n");
    console.log("=".repeat(70));

    if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
        throw new Error("Missing PK or FUNDER_ADDRESS in .env");
    }

    const wallet = new ethers.Wallet(process.env.PK);
    const host = process.env.CLOB_API_URL || "https://clob.polymarket.com";
    const chainId = parseInt(process.env.CHAIN_ID || "137");
    const signatureType = parseInt(process.env.SIGNATURE_TYPE || "0");

    console.log(`\n👤 Адрес: ${await wallet.getAddress()}`);

    // Инициализация с API ключами
    console.log("🔑 Получение API ключей...");
    const tempClient = new ClobClient(host, chainId, wallet);
    const creds = await tempClient.createOrDeriveApiKey();

    const client = new ClobClient(
        host,
        chainId,
        wallet,
        creds,
        signatureType,
        process.env.FUNDER_ADDRESS
    );

    try {
        // 1. Открытые ордера
        console.log("\n📋 ОТКРЫТЫЕ ОРДЕРА");
        console.log("=".repeat(70));

        const openOrders = await client.getOpenOrders();

        if (!openOrders || openOrders.length === 0) {
            console.log("Нет открытых ордеров\n");
        } else {
            console.log(`Всего открытых ордеров: ${openOrders.length}\n`);

            for (let i = 0; i < openOrders.length; i++) {
                const order = openOrders[i];
                console.log(`${i + 1}. Order ID: ${order.id}`);
                console.log(`   Market: ${order.market}`);
                console.log(`   Outcome: ${order.outcome}`);
                console.log(`   Side: ${order.side}`);
                console.log(`   Price: ${parseFloat(order.price) * 100}%`);
                console.log(`   Size: ${order.original_size} (matched: ${order.size_matched})`);
                console.log(`   Created: ${new Date(order.created_at).toLocaleString()}`);
                console.log("");
            }
        }

        // 2. История сделок (последние 10)
        console.log("\n📈 ИСТОРИЯ СДЕЛОК (последние 10)");
        console.log("=".repeat(70));

        const trades = await client.getTrades({ limit: 10 });

        if (!trades || trades.length === 0) {
            console.log("Нет сделок\n");
        } else {
            console.log(`Найдено сделок: ${trades.length}\n`);

            for (let i = 0; i < trades.length; i++) {
                const trade = trades[i];
                console.log(`${i + 1}. Trade ID: ${trade.id}`);
                console.log(`   Market: ${trade.market}`);
                console.log(`   Outcome: ${trade.outcome}`);
                console.log(`   Side: ${trade.side}`);
                console.log(`   Price: ${parseFloat(trade.price) * 100}%`);
                console.log(`   Size: ${trade.size}`);
                console.log(`   Fee: ${parseFloat(trade.fee_rate_bps) / 100}%`);
                console.log(`   Time: ${new Date(trade.timestamp).toLocaleString()}`);
                console.log("");
            }
        }

        // 3. Активные позиции (анализ из сделок)
        console.log("\n💼 АКТИВНЫЕ ПОЗИЦИИ");
        console.log("=".repeat(70));

        // Группируем сделки по asset_id
        const positionMap = new Map<string, {
            market: string;
            outcome: string;
            asset_id: string;
            buySize: number;
            sellSize: number;
            totalCost: number;
        }>();

        for (const trade of trades) {
            const key = trade.asset_id;
            const existing = positionMap.get(key) || {
                market: trade.market,
                outcome: trade.outcome,
                asset_id: trade.asset_id,
                buySize: 0,
                sellSize: 0,
                totalCost: 0
            };

            const size = parseFloat(trade.size);
            const price = parseFloat(trade.price);

            if (trade.side === "BUY") {
                existing.buySize += size;
                existing.totalCost += size * price;
            } else {
                existing.sellSize += size;
                existing.totalCost -= size * price;
            }

            positionMap.set(key, existing);
        }

        // Показываем позиции
        const positions = Array.from(positionMap.values()).filter(p =>
            Math.abs(p.buySize - p.sellSize) > 0.01
        );

        if (positions.length === 0) {
            console.log("Нет активных позиций\n");
        } else {
            console.log(`Активных позиций: ${positions.length}\n`);

            for (let i = 0; i < positions.length; i++) {
                const pos = positions[i];
                const netSize = pos.buySize - pos.sellSize;
                const avgPrice = pos.totalCost / pos.buySize;

                console.log(`${i + 1}. Market: ${pos.market}`);
                console.log(`   Outcome: ${pos.outcome}`);
                console.log(`   Token: ${pos.asset_id}`);
                console.log(`   Net Size: ${netSize.toFixed(2)}`);
                console.log(`   Avg Price: ${(avgPrice * 100).toFixed(2)}%`);
                console.log(`   Total Cost: ${pos.totalCost.toFixed(2)} USDC`);
                console.log("");
            }
        }

        // 4. USDC баланс
        console.log("\n💰 БАЛАНСЫ");
        console.log("=".repeat(70));

        try {
            const balanceResponse = await client.getBalanceAllowance({
                asset_type: "COLLATERAL"
            });

            if (balanceResponse && balanceResponse.balance) {
                const balance = parseFloat(balanceResponse.balance) / 1e6; // USDC имеет 6 decimals
                const allowance = parseFloat(balanceResponse.allowance) / 1e6;

                console.log(`USDC Balance: ${balance.toFixed(2)} USDC`);
                console.log(`USDC Allowance: ${allowance.toFixed(2)} USDC`);
            }
        } catch (error: any) {
            console.log(`Ошибка получения баланса: ${error.message}`);
        }

        console.log("\n" + "=".repeat(70));
        console.log("✅ ПРОВЕРКА ЗАВЕРШЕНА");
        console.log("=".repeat(70));

    } catch (error: any) {
        console.error("\n❌ Ошибка:", error.message);
        if (error.response?.data) {
            console.error("Детали:", JSON.stringify(error.response.data, null, 2));
        }
    }
}

checkPositions().catch(error => {
    console.error("Ошибка:", error);
    process.exit(1);
});
