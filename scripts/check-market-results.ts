/**
 * Скрипт для проверки результатов по всем вашим рынкам
 * Показывает выигрышные и проигрышные позиции
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient, AssetType } from "@polymarket/clob-client";
import { Market, MarketToken } from "../src/types/market";

dotenvConfig({ path: resolve(__dirname, "../.env") });

interface MarketResult {
    conditionId: string;
    question: string;
    outcome: string;
    side: string;
    size: number;
    price: number;
    isResolved: boolean;
    winner?: string;
    isWinner: boolean;
    status: 'win' | 'loss' | 'pending';
}

async function checkMarketResults() {
    console.log("🔍 ПРОВЕРКА РЕЗУЛЬТАТОВ ПО РЫНКАМ\n");
    console.log("=".repeat(70));

    if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
        throw new Error("Missing PK or FUNDER_ADDRESS in .env");
    }

    const wallet = new ethers.Wallet(process.env.PK);
    const host = process.env.CLOB_API_URL || "https://clob.polymarket.com";
    const chainId = parseInt(process.env.CHAIN_ID || "137");
    const signatureType = parseInt(process.env.SIGNATURE_TYPE || "0");

    console.log(`\n👤 Адрес: ${await wallet.getAddress()}\n`);

    // Инициализация CLOB Client
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

    console.log("✅ CLOB Client инициализирован\n");

    // Получаем все сделки
    console.log("📊 Получение истории сделок...");
    const trades = await client.getTrades({});
    console.log(`   Найдено сделок: ${trades.length}\n`);

    // Создаем мапу токен -> condition_id
    const tokenToCondition = new Map<string, string>();
    
    // Сначала попробуем найти рынки через getMarket для каждого токена
    console.log("📈 Получение информации о рынках...");
    const marketsMap = new Map<string, Market>();
    
    // Получаем все рынки из sampling
    const allMarkets = await client.getSamplingMarkets();
    for (const market of allMarkets.data || []) {
        marketsMap.set(market.condition_id, market);
        if (market.tokens) {
            for (const token of market.tokens) {
                tokenToCondition.set(token.token_id, market.condition_id);
            }
        }
    }
    
    // Для токенов, которых нет в sampling, пытаемся найти через getMarket
    const processedTokens = new Set<string>();
    for (const trade of trades) {
        if (processedTokens.has(trade.asset_id)) continue;
        processedTokens.add(trade.asset_id);
        
        if (!tokenToCondition.has(trade.asset_id)) {
            // Пытаемся найти через getMarket (если знаем condition_id)
            // Но мы не знаем condition_id из trade, поэтому пропускаем
            continue;
        }
    }
    
    console.log(`   Найдено рынков в кэше: ${marketsMap.size}`);
    console.log(`   Сопоставлено токенов: ${tokenToCondition.size}\n`);

    // Группируем сделки по рынкам
    const marketResults = new Map<string, MarketResult[]>();

    for (const trade of trades) {
        const conditionId = tokenToCondition.get(trade.asset_id);
        if (!conditionId) {
            console.log(`⚠️  Не найден рынок для токена ${trade.asset_id}`);
            continue;
        }
        
        const market = marketsMap.get(conditionId);
        if (!market) {
            console.log(`⚠️  Не найдена информация о рынке ${conditionId}`);
            continue;
        }

        const token = market.tokens?.find((t: MarketToken) => t.token_id === trade.asset_id);
        if (!token) continue;

        const key = market.condition_id;
        const existing = marketResults.get(key) || [];

        const isResolved = market.closed === true;
        const winnerToken = market.tokens?.find((t: MarketToken) => t.winner === true);
        const winner = winnerToken?.outcome;
        const isWinner = token.winner === true && isResolved;
        
        let status: 'win' | 'loss' | 'pending' = 'pending';
        if (isResolved) {
            status = isWinner ? 'win' : 'loss';
        }

        existing.push({
            conditionId: market.condition_id,
            question: market.question,
            outcome: token.outcome,
            side: trade.side,
            size: parseFloat(trade.size),
            price: parseFloat(trade.price),
            isResolved,
            winner,
            isWinner,
            status
        });

        marketResults.set(key, existing);
    }

    // Выводим результаты
    console.log("=".repeat(70));
    console.log("📊 РЕЗУЛЬТАТЫ ПО РЫНКАМ");
    console.log("=".repeat(70));

    let totalWins = 0;
    let totalLosses = 0;
    let totalPending = 0;

    for (const [conditionId, results] of marketResults.entries()) {
        const firstResult = results[0];
        if (!firstResult) continue;

        // Подсчитываем итоговую позицию
        let netSize = 0;
        let totalCost = 0;
        for (const result of results) {
            if (result.side === 'BUY') {
                netSize += result.size;
                totalCost += result.size * result.price;
            } else {
                netSize -= result.size;
                totalCost -= result.size * result.price;
            }
        }

        const avgPrice = netSize > 0 ? totalCost / netSize : 0;
        const status = firstResult.status;

        if (status === 'win') totalWins++;
        else if (status === 'loss') totalLosses++;
        else totalPending++;

        console.log(`\n📊 ${firstResult.question.substring(0, 60)}${firstResult.question.length > 60 ? '...' : ''}`);
        console.log(`   Condition ID: ${conditionId}`);
        console.log(`   Позиция: ${netSize > 0 ? 'LONG' : netSize < 0 ? 'SHORT' : 'CLOSED'} ${firstResult.outcome}`);
        console.log(`   Размер: ${Math.abs(netSize).toFixed(2)}`);
        if (avgPrice > 0) {
            console.log(`   Средняя цена: ${(avgPrice * 100).toFixed(2)}%`);
        }

        if (firstResult.isResolved) {
            console.log(`   ✅ Рынок разрешен`);
            console.log(`   🏆 Победитель: ${firstResult.winner || 'Не определен'}`);
            if (firstResult.status === 'win') {
                console.log(`   🟢 ВЫИГРЫШ! Ваш прогноз оказался верным`);
            } else if (firstResult.status === 'loss') {
                console.log(`   🔴 ПРОИГРЫШ. Ваш прогноз не сбылся`);
            }
        } else {
            console.log(`   ⏳ Рынок еще не разрешен`);
            console.log(`   Статус: Ожидание разрешения`);
        }
    }

    console.log("\n" + "=".repeat(70));
    console.log("📈 ИТОГОВАЯ СТАТИСТИКА");
    console.log("=".repeat(70));
    console.log(`🟢 Выигрышных позиций: ${totalWins}`);
    console.log(`🔴 Проигрышных позиций: ${totalLosses}`);
    console.log(`⏳ Ожидающих разрешения: ${totalPending}`);
    console.log(`📊 Всего рынков: ${marketResults.size}\n`);

    // Проверяем баланс
    const balance = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    const usdc = parseFloat(balance.balance) / 1e6;
    console.log(`💰 Текущий баланс USDC: ${usdc.toFixed(2)} USDC\n`);
}

checkMarketResults().catch(error => {
    console.error("❌ Ошибка:", error);
    process.exit(1);
});

