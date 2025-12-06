/**
 * Скрипт для проверки и клейма выигрышей на Polymarket
 * 
 * После разрешения рынка выигрышные токены (YES или NO) становятся worth $1 каждый.
 * Этот скрипт:
 * 1. Проверяет все ваши позиции
 * 2. Находит разрешенные рынки с выигрышными токенами
 * 3. Вызывает redeemPositions для обмена токенов на USDC
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient, AssetType } from "@polymarket/clob-client";
import { getContractConfig } from "@polymarket/clob-client/dist/config";
// @ts-ignore - ctfAbi не имеет типов, используем локальный путь
import { ctfAbi } from "../clob-client/examples/abi/ctfAbi";
import { Market, MarketToken } from "../src/types/market";

dotenvConfig({ path: resolve(__dirname, "../.env") });

interface ResolvedPosition {
    conditionId: string;
    outcomeSlot: number;
    tokenId: string;
    balance: string;
    market: string;
    outcome: string;
    isWinner: boolean;
}

async function getResolvedMarkets(client: ClobClient): Promise<Map<string, { winnerOutcome: string; resolved: boolean }>> {
    // Получаем все рынки и фильтруем закрытые
    const allMarkets = await client.getSamplingMarkets();
    const resolvedMap = new Map<string, { winnerOutcome: string; resolved: boolean }>();

    for (const market of allMarkets.data || []) {
        if (market.closed && market.tokens) {
            // Находим выигрышный токен (winner = true)
            const winnerToken = market.tokens.find((t: MarketToken) => t.winner === true);
            if (winnerToken) {
                resolvedMap.set(market.condition_id, {
                    winnerOutcome: winnerToken.outcome,
                    resolved: true
                });
            }
        }
    }

    return resolvedMap;
}

async function getTokenBalances(
    client: ClobClient,
    wallet: ethers.Wallet,
    provider: ethers.providers.Provider,
    chainId: number
): Promise<Map<string, string>> {
    const contractConfig = getContractConfig(chainId);
    const ctfContract = new ethers.Contract(
        contractConfig.conditionalTokens,
        ctfAbi,
        wallet.connect(provider)
    );

    // Получаем все позиции через getTrades
    const trades = await client.getTrades({});

    const tokenBalances = new Map<string, string>();
    const positionMap = new Map<string, { buySize: number; sellSize: number }>();

    // Группируем сделки по token_id
    for (const trade of trades) {
        const tokenId = trade.asset_id;
        const size = parseFloat(trade.size);
        
        const existing = positionMap.get(tokenId) || { buySize: 0, sellSize: 0 };
        if (trade.side === 'BUY') {
            existing.buySize += size;
        } else if (trade.side === 'SELL') {
            existing.sellSize += size;
        }
        positionMap.set(tokenId, existing);
    }

    // Для каждого токена проверяем баланс через контракт
    for (const [tokenId, position] of positionMap.entries()) {
        const netSize = position.buySize - position.sellSize;
        if (netSize > 0.01) { // Только если есть позиция
            try {
                const balance = await ctfContract.balanceOf(wallet.address, tokenId);
                const balanceString = balance.toString();
                if (parseFloat(balanceString) > 0) {
                    tokenBalances.set(tokenId, balanceString);
                }
            } catch (error) {
                console.warn(`Failed to get balance for token ${tokenId}:`, error);
            }
        }
    }

    return tokenBalances;
}

async function findWinningPositions(
    client: ClobClient,
    wallet: ethers.Wallet,
    provider: ethers.providers.Provider,
    chainId: number
): Promise<ResolvedPosition[]> {
    const resolvedMarkets = await getResolvedMarkets(client);
    const tokenBalances = await getTokenBalances(client, wallet, provider, chainId);
    const trades = await client.getTrades({});
    const allMarkets = await client.getSamplingMarkets();

    const winningPositions: ResolvedPosition[] = [];

    // Создаем мапу рынков по condition_id
    const marketsMap = new Map<string, Market>();
    for (const market of allMarkets.data || []) {
        marketsMap.set(market.condition_id, market);
    }

    // Проверяем каждый токен с балансом
    for (const [tokenId, balance] of tokenBalances.entries()) {
        // Находим сделку с этим токеном чтобы получить condition_id
        const trade = trades.find((t: { asset_id: string }) => t.asset_id === tokenId);
        if (!trade) continue;

        // Находим рынок
        const market = Array.from(marketsMap.values()).find((m: Market) => 
            m.tokens?.some((t: MarketToken) => t.token_id === tokenId)
        );
        if (!market) continue;

        const resolved = resolvedMarkets.get(market.condition_id);
        if (!resolved || !resolved.resolved) continue;

        // Находим токен в рынке
        const token = market.tokens?.find((t: MarketToken) => t.token_id === tokenId);
        if (!token) continue;

        const isWinner = token.winner === true;
        if (!isWinner) continue;

        // Вычисляем outcomeSlot (0 для YES, 1 для NO)
        const outcomeSlot = token.outcome === 'Yes' ? 0 : 1;

        winningPositions.push({
            conditionId: market.condition_id,
            outcomeSlot,
            tokenId,
            balance,
            market: market.question,
            outcome: token.outcome,
            isWinner: true
        });
    }

    return winningPositions;
}

async function redeemPositions(
    wallet: ethers.Wallet,
    provider: ethers.providers.Provider,
    chainId: number,
    positions: ResolvedPosition[]
): Promise<void> {
    if (positions.length === 0) {
        console.log("✅ Нет позиций для клейма");
        return;
    }

    const contractConfig = getContractConfig(chainId);
    const ctfContract = new ethers.Contract(
        contractConfig.conditionalTokens,
        ctfAbi,
        wallet.connect(provider)
    );

    // Группируем позиции по conditionId
    const positionsByCondition = new Map<string, ResolvedPosition[]>();
    for (const pos of positions) {
        const existing = positionsByCondition.get(pos.conditionId) || [];
        existing.push(pos);
        positionsByCondition.set(pos.conditionId, existing);
    }

    console.log(`\n💰 Найдено ${positions.length} выигрышных позиций в ${positionsByCondition.size} рынках\n`);

    for (const [conditionId, conditionPositions] of positionsByCondition.entries()) {
        const conditionIdBytes = ethers.utils.hexZeroPad(conditionId, 32);
        // parentCollectionId для Polymarket - обычно нулевой bytes32 (корневая коллекция)
        const parentCollectionId = ethers.constants.HashZero;
        
        // Для binary markets: YES = indexSet [1], NO = indexSet [0]
        // Но для redeem нужны все возможные indexSets для данного condition
        // Обычно это [0, 1] для binary markets
        const indexSets = [[0, 1]]; // Все возможные outcomes для binary market

        const firstPosition = conditionPositions[0];
        if (!firstPosition) continue;
        
        console.log(`📊 Рынок: ${firstPosition.market}`);
        console.log(`   Токенов для клейма: ${conditionPositions.length}`);
        
        let totalAmount = ethers.BigNumber.from(0);
        for (const pos of conditionPositions) {
            const balance = ethers.BigNumber.from(pos.balance);
            totalAmount = totalAmount.add(balance);
            console.log(`   - ${pos.outcome}: ${ethers.utils.formatUnits(balance, 6)} токенов`);
        }

        try {
            console.log(`\n🔄 Вызов redeemPositions...`);
            console.log(`   Collateral: ${contractConfig.collateral}`);
            console.log(`   Condition ID: ${conditionId}`);
            console.log(`   Index Sets: [0, 1]`);
            
            const tx = await ctfContract.redeemPositions(
                contractConfig.collateral,
                parentCollectionId,
                conditionIdBytes,
                indexSets
            );

            console.log(`   ⏳ Транзакция отправлена: ${tx.hash}`);
            console.log(`   Ожидание подтверждения...`);

            const receipt = await tx.wait();
            console.log(`   ✅ Транзакция подтверждена в блоке ${receipt.blockNumber}`);
            console.log(`   💰 Получено: ${ethers.utils.formatUnits(totalAmount, 6)} USDC\n`);

        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`   ❌ Ошибка при клейме: ${errorMsg}\n`);
        }
    }
}

async function main() {
    console.log("🔍 ПРОВЕРКА И КЛЕЙМ ВЫИГРЫШЕЙ\n");
    console.log("=".repeat(70));

    if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
        throw new Error("Missing PK or FUNDER_ADDRESS in .env");
    }

    const wallet = new ethers.Wallet(process.env.PK);
    const host = process.env.CLOB_API_URL || "https://clob.polymarket.com";
    const chainId = parseInt(process.env.CHAIN_ID || "137");
    const signatureType = parseInt(process.env.SIGNATURE_TYPE || "0");

    // Провайдер для Polygon
    const provider = new ethers.providers.JsonRpcProvider(
        chainId === 137 
            ? "https://polygon-rpc.com"
            : "https://rpc-amoy.polygon.technology"
    );

    console.log(`\n👤 Адрес: ${await wallet.getAddress()}`);
    console.log(`🌐 CLOB API: ${host}`);
    console.log(`🔗 Chain ID: ${chainId}\n`);

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

    // Проверка баланса USDC до клейма
    const balanceBefore = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    const usdcBefore = parseFloat(balanceBefore.balance) / 1e6;
    console.log(`💰 Текущий баланс USDC: ${usdcBefore.toFixed(2)} USDC\n`);

    // Поиск выигрышных позиций
    console.log("🔍 Поиск выигрышных позиций...\n");
    const winningPositions = await findWinningPositions(client, wallet, provider, chainId);

    if (winningPositions.length === 0) {
        console.log("✅ Нет выигрышных позиций для клейма");
        console.log("\n💡 Примечание:");
        console.log("   - Рынки должны быть разрешены (closed = true)");
        console.log("   - У вас должны быть выигрышные токены (YES или NO с winner = true)");
        console.log("   - Проверьте баланс токенов через getTrades()\n");
        return;
    }

    console.log(`\n🎉 Найдено ${winningPositions.length} выигрышных позиций:\n`);
    for (const pos of winningPositions) {
        const amount = parseFloat(ethers.utils.formatUnits(pos.balance, 6));
        console.log(`   ✅ ${pos.outcome} в "${pos.market.substring(0, 50)}..."`);
        console.log(`      Количество: ${amount.toFixed(2)} токенов (≈ $${amount.toFixed(2)})\n`);
    }

    // Спрашиваем подтверждение
    console.log("⚠️  ВНИМАНИЕ: Вы собираетесь обменять выигрышные токены на USDC");
    console.log("   Это действие нельзя отменить!\n");

    // Для автоматического запуска можно использовать переменную окружения
    if (process.env.AUTO_CLAIM !== "true") {
        console.log("💡 Для автоматического клейма установите AUTO_CLAIM=true в .env");
        console.log("   Или запустите скрипт с --auto флагом\n");
        return;
    }

    // Клейм позиций
    await redeemPositions(wallet, provider, chainId, winningPositions);

    // Проверка баланса USDC после клейма
    const balanceAfter = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    const usdcAfter = parseFloat(balanceAfter.balance) / 1e6;
    const claimed = usdcAfter - usdcBefore;

    console.log("\n" + "=".repeat(70));
    console.log("📊 ИТОГИ КЛЕЙМА");
    console.log("=".repeat(70));
    console.log(`💰 Баланс до:  ${usdcBefore.toFixed(2)} USDC`);
    console.log(`💰 Баланс после: ${usdcAfter.toFixed(2)} USDC`);
    console.log(`🎉 Заклеймлено: +${claimed.toFixed(2)} USDC\n`);
}

main().catch(error => {
    console.error("❌ Ошибка:", error);
    process.exit(1);
});

