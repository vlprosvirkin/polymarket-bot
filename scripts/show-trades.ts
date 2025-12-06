/**
 * Простой скрипт для вывода всех сделок с токенами
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";

dotenvConfig({ path: resolve(__dirname, "../.env") });

async function showTrades() {
    if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
        throw new Error("Missing PK or FUNDER_ADDRESS in .env");
    }

    const wallet = new ethers.Wallet(process.env.PK);
    const host = process.env.CLOB_API_URL || "https://clob.polymarket.com";
    const chainId = parseInt(process.env.CHAIN_ID || "137");
    const signatureType = parseInt(process.env.SIGNATURE_TYPE || "0");

    console.log(`👤 Адрес: ${await wallet.getAddress()}\n`);

    const tempClient = new ClobClient(host, chainId, wallet);
    const creds = await tempClient.createOrDeriveApiKey();
    const client = new ClobClient(host, chainId, wallet, creds, signatureType, process.env.FUNDER_ADDRESS);

    const trades = await client.getTrades({});
    
    console.log(`📊 Найдено сделок: ${trades.length}\n`);
    console.log("=".repeat(70));
    
    // Группируем по токенам
    const tokenTrades = new Map<string, typeof trades>();
    for (const trade of trades) {
        const existing = tokenTrades.get(trade.asset_id) || [];
        existing.push(trade);
        tokenTrades.set(trade.asset_id, existing);
    }

    console.log(`\n📈 Уникальных токенов: ${tokenTrades.size}\n`);
    
    for (const [tokenId, tokenTradesList] of tokenTrades.entries()) {
        let netSize = 0;
        let totalCost = 0;
        
        console.log(`\n🪙 Токен: ${tokenId}`);
        console.log(`   Сделок: ${tokenTradesList.length}`);
        
        for (const trade of tokenTradesList) {
            const size = parseFloat(trade.size);
            const price = parseFloat(trade.price);
            
            if (trade.side === 'BUY') {
                netSize += size;
                totalCost += size * price;
            } else {
                netSize -= size;
                totalCost -= size * price;
            }
            
            console.log(`   - ${trade.side} ${size} @ ${(price * 100).toFixed(2)}% (${new Date(trade.match_time).toLocaleString('ru-RU')})`);
        }
        
        if (netSize > 0.01) {
            const avgPrice = totalCost / netSize;
            console.log(`   📊 Итоговая позиция: LONG ${netSize.toFixed(2)} @ ${(avgPrice * 100).toFixed(2)}%`);
        } else if (netSize < -0.01) {
            const avgPrice = Math.abs(totalCost / netSize);
            console.log(`   📊 Итоговая позиция: SHORT ${Math.abs(netSize).toFixed(2)} @ ${(avgPrice * 100).toFixed(2)}%`);
        } else {
            console.log(`   📊 Позиция закрыта`);
        }
        
        // Ссылка для проверки на Polymarket
        console.log(`   🔗 Проверить на Polymarket: https://polymarket.com/event/${tokenId}`);
    }
    
    console.log("\n" + "=".repeat(70));
    console.log("💡 Для проверки результатов:");
    console.log("   1. Перейдите на https://polymarket.com");
    console.log("   2. Введите токен ID в поиск");
    console.log("   3. Проверьте статус рынка (разрешен/не разрешен)");
    console.log("   4. Если разрешен - проверьте какой исход выиграл\n");
}

showTrades().catch(error => {
    console.error("❌ Ошибка:", error);
    process.exit(1);
});

