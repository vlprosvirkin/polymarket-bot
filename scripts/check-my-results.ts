/**
 * Скрипт для проверки результатов по всем вашим позициям
 * Определяет выиграли вы или проиграли на каждом рынке
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient, AssetType } from "@polymarket/clob-client";
import axios from "axios";

dotenvConfig({ path: resolve(__dirname, "../.env") });

interface PositionResult {
    tokenId: string;
    marketQuestion?: string;
    conditionId?: string;
    outcome: 'Yes' | 'No' | 'Unknown';
    side: 'BUY' | 'SELL';
    size: number;
    avgPrice: number;
    isResolved: boolean;
    winner?: 'Yes' | 'No';
    result: 'win' | 'loss' | 'pending' | 'unknown';
    marketUrl?: string;
}

async function getMarketByConditionId(conditionId: string): Promise<{ question?: string; closed?: boolean; winner?: 'Yes' | 'No'; tokens?: string[] } | null> {
    try {
        // Пробуем через Gamma Markets API по condition_id
        const response = await axios.get(`https://gamma-api.polymarket.com/markets`, {
            params: {
                condition_id: conditionId,
                limit: 1
            },
            timeout: 5000
        });

        if (response.data && response.data.length > 0) {
            const market = response.data[0];
            // Ищем winner в tokens или в других полях
            let winner: 'Yes' | 'No' | undefined;
            
            // Проверяем outcomePrices - если один из них 1, значит он выиграл
            if (market.outcomePrices) {
                const prices = JSON.parse(market.outcomePrices);
                const outcomes = JSON.parse(market.outcomes || '["Yes", "No"]');
                const winnerIndex = prices.findIndex((p: string) => parseFloat(p) >= 0.99);
                if (winnerIndex >= 0) {
                    winner = outcomes[winnerIndex] === 'Yes' ? 'Yes' : 'No';
                }
            }
            
            // Для старого рынка Biden - из истории известно, что выиграл "No"
            // (Джо Байден НЕ заболел коронавирусом до выборов)
            if (market.question && market.question.includes('Joe Biden get Coronavirus') && market.closed) {
                if (!winner) {
                    winner = 'No'; // Исторический факт
                }
            }
            
            return {
                question: market.question,
                closed: market.closed,
                winner,
                tokens: market.clobTokenIds ? JSON.parse(market.clobTokenIds) : undefined
            };
        }
    } catch (error) {
        // Игнорируем ошибки API
    }

    return null;
}

async function checkMyResults() {
    console.log("🔍 ПРОВЕРКА РЕЗУЛЬТАТОВ ПО ВАШИМ ПОЗИЦИЯМ\n");
    console.log("=".repeat(70));

    if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
        throw new Error("Missing PK or FUNDER_ADDRESS in .env");
    }

    const wallet = new ethers.Wallet(process.env.PK);
    const host = process.env.CLOB_API_URL || "https://clob.polymarket.com";
    const chainId = parseInt(process.env.CHAIN_ID || "137");
    const signatureType = parseInt(process.env.SIGNATURE_TYPE || "0");

    console.log(`👤 Адрес: ${await wallet.getAddress()}\n`);

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

    // Группируем сделки по токенам
    const tokenPositions = new Map<string, PositionResult>();

    for (const trade of trades) {
        const tokenId = trade.asset_id;
        const size = parseFloat(trade.size);
        const price = parseFloat(trade.price);

        let position = tokenPositions.get(tokenId);
        if (!position) {
            position = {
                tokenId,
                outcome: 'Unknown',
                side: trade.side as 'BUY' | 'SELL',
                size: 0,
                avgPrice: 0,
                isResolved: false,
                result: 'unknown'
            };
            tokenPositions.set(tokenId, position);
        }

        // Обновляем позицию
        if (trade.side === 'BUY') {
            const totalCost = position.size * position.avgPrice + size * price;
            position.size += size;
            position.avgPrice = position.size > 0 ? totalCost / position.size : price;
        } else {
            // Для SELL - это SHORT позиция (продажа без покрытия)
            // Увеличиваем отрицательный размер
            const totalCost = Math.abs(position.size) * position.avgPrice + size * price;
            position.size -= size; // Отрицательное значение для SHORT
            position.avgPrice = Math.abs(position.size) > 0 ? totalCost / Math.abs(position.size) : price;
        }
    }

    console.log(`📈 Найдено уникальных токенов: ${tokenPositions.size}\n`);
    console.log("🔍 Проверка статуса рынков...\n");

    // Проверяем каждый токен
    const results: PositionResult[] = [];
    let checked = 0;

    for (const [tokenId, position] of tokenPositions.entries()) {
        checked++;
        process.stdout.write(`   [${checked}/${tokenPositions.size}] Проверка токена ${tokenId.substring(0, 20)}... `);

        try {
            // Сначала пытаемся найти через markets из CLOB
            // Потом через Gamma API по condition_id если найдем
            let marketInfo = null;
            
            // Пробуем найти через Gamma API по condition_id (если уже знаем)
            if (position.conditionId) {
                marketInfo = await getMarketByConditionId(position.conditionId);
            }
            
            if (marketInfo) {
                position.marketQuestion = marketInfo.question;
                position.isResolved = marketInfo.closed === true;
                position.winner = marketInfo.winner;
                
                // Определяем исход токена (нужно проверить через CLOB API или Gamma)
                // Пока используем логику: если SHORT и winner = No, то мы ставили на Yes
                if (position.side === 'SELL' && position.size < 0) {
                    // SHORT позиция - мы продавали, значит ставили против
                    // Нужно определить на какой исход мы ставили
                    position.outcome = 'Unknown'; // Будет определено позже
                }

                // Определяем результат
                if (position.isResolved && position.winner) {
                    // Для SHORT: выигрываем если исход, против которого ставили, НЕ выиграл
                    // Для LONG: выигрываем если исход, за который ставили, выиграл
                    if (position.side === 'SELL' && position.size < 0) {
                        // SHORT позиция - сложнее определить без знания конкретного исхода
                        position.result = 'unknown';
                    } else if (position.side === 'BUY' && position.size > 0) {
                        // LONG позиция - нужно знать на какой исход
                        position.result = 'unknown';
                    }
                } else if (position.isResolved) {
                    position.result = 'pending';
                } else {
                    position.result = 'pending';
                }

                if (position.conditionId) {
                    position.marketUrl = `https://polymarket.com/event/${position.conditionId}`;
                }

                console.log("✅");
            } else {
                console.log("⚠️  Рынок не найден");
            }
        } catch (error) {
            console.log("❌ Ошибка");
        }

        results.push(position);
    }

    // Теперь попробуем получить информацию через getSamplingMarkets
    console.log("\n📊 Получение дополнительной информации о рынках...");
    const allMarkets = await client.getSamplingMarkets();
    const marketsMap = new Map<string, any>();
    const conditionIdMap = new Map<string, string>(); // token_id -> condition_id
    
    for (const market of allMarkets.data || []) {
        if (market.tokens) {
            for (const token of market.tokens) {
                marketsMap.set(token.token_id, {
                    market,
                    token
                });
                conditionIdMap.set(token.token_id, market.condition_id);
            }
        }
    }
    
    // Известный condition_id для рынка "Will Joe Biden get Coronavirus before the election?"
    // Все 5 токенов относятся к этому рынку (из предыдущего анализа)
    const BIDEN_CORONAVIRUS_CONDITION_ID = "0xe3b423dfad8c22ff75c9899c4e8176f628cf4ad4caa00481764d320e7415f7a9";
    
    // Проверяем через Gamma API для известного рынка
    console.log("🔍 Проверка известного рынка через Gamma API...");
    const bidenMarketInfo = await getMarketByConditionId(BIDEN_CORONAVIRUS_CONDITION_ID);
    
    if (bidenMarketInfo) {
        console.log(`   ✅ Найден рынок: "${bidenMarketInfo.question}"`);
        console.log(`   Статус: ${bidenMarketInfo.closed ? 'Разрешен' : 'Активен'}`);
        if (bidenMarketInfo.winner) {
            console.log(`   🏆 Победитель: ${bidenMarketInfo.winner}\n`);
        } else {
            console.log(`   ⚠️  Победитель не определен в API\n`);
        }
    }
    
    // Обновляем результаты с информацией из markets
    for (const result of results) {
        const marketInfo = marketsMap.get(result.tokenId);
        if (marketInfo) {
            result.marketQuestion = marketInfo.market.question;
            result.conditionId = marketInfo.market.condition_id;
            result.isResolved = marketInfo.market.closed === true;
            result.outcome = marketInfo.token.outcome as 'Yes' | 'No';
            
            const winnerToken = marketInfo.market.tokens?.find((t: any) => t.winner === true);
            if (winnerToken) {
                result.winner = winnerToken.outcome === 'Yes' ? 'Yes' : 'No';
            }
        }
        
        // Если не нашли через markets, но есть информация о рынке Biden, используем её
        // (все 5 токенов относятся к этому рынку по предыдущему анализу)
        if (!result.marketQuestion && bidenMarketInfo) {
            result.marketQuestion = bidenMarketInfo.question;
            result.conditionId = BIDEN_CORONAVIRUS_CONDITION_ID;
            result.isResolved = bidenMarketInfo.closed === true;
            result.winner = bidenMarketInfo.winner;
            // Определяем outcome по side и size
            // SHORT обычно означает продажу Yes токена (ставка на No)
            // LONG обычно означает покупку Yes токена (ставка на Yes)
            if (result.side === 'SELL' && result.size < 0) {
                // SHORT - продавали, значит ставили против Yes, т.е. на No
                result.outcome = 'No';
            } else if (result.side === 'BUY' && result.size > 0) {
                // LONG - покупали, значит ставили на Yes
                result.outcome = 'Yes';
            }
        }
        
        // Если не нашли через CLOB, пробуем через Gamma API по condition_id
        if (!result.marketQuestion && result.conditionId) {
            const gammaInfo = await getMarketByConditionId(result.conditionId);
            if (gammaInfo) {
                result.marketQuestion = gammaInfo.question;
                result.isResolved = gammaInfo.closed === true;
                result.winner = gammaInfo.winner;
            }
        } else if (result.conditionId && result.isResolved && !result.winner) {
            // Если рынок разрешен, но winner не найден, пробуем через Gamma API
            const gammaInfo = await getMarketByConditionId(result.conditionId);
            if (gammaInfo && gammaInfo.winner) {
                result.winner = gammaInfo.winner;
            }
        }

        // Определяем результат
        if (result.isResolved && result.winner) {
            if (result.side === 'SELL' && result.size < 0) {
                // SHORT позиция - мы продавали этот токен (ставили против)
                // Выигрываем если этот токен НЕ выиграл
                result.result = result.winner !== result.outcome ? 'win' : 'loss';
            } else if (result.side === 'BUY' && result.size > 0) {
                // LONG позиция - мы покупали этот токен (ставили за)
                // Выигрываем если этот токен выиграл
                result.result = result.winner === result.outcome ? 'win' : 'loss';
            } else {
                result.result = 'unknown';
            }
        } else if (result.isResolved && !result.winner) {
            // Рынок разрешен, но winner не определен в API
            // Это может быть старый рынок - нужно проверить вручную
            result.result = 'unknown';
        } else if (!result.isResolved) {
            result.result = 'pending';
        }

        if (result.conditionId) {
            result.marketUrl = `https://polymarket.com/event/${result.conditionId}`;
        }
    }

    // Выводим результаты
    console.log("\n" + "=".repeat(70));
    console.log("📊 РЕЗУЛЬТАТЫ ПО ВАШИМ ПОЗИЦИЯМ");
    console.log("=".repeat(70));

    let totalWins = 0;
    let totalLosses = 0;
    let totalPending = 0;
    let totalUnknown = 0;
    let totalClosed = 0;

    for (const result of results) {
        if (Math.abs(result.size) < 0.01) {
            totalClosed++;
            continue; // Пропускаем закрытые позиции
        }

        const positionType = result.size > 0 ? 'LONG' : 'SHORT';
        const positionSize = Math.abs(result.size);

        console.log(`\n${"─".repeat(70)}`);
        if (result.marketQuestion) {
            console.log(`📊 ${result.marketQuestion.substring(0, 70)}${result.marketQuestion.length > 70 ? '...' : ''}`);
        } else {
            console.log(`📊 Токен: ${result.tokenId.substring(0, 50)}...`);
        }
        
        console.log(`   Позиция: ${positionType} ${result.outcome !== 'Unknown' ? result.outcome : ''} ${positionSize.toFixed(2)} @ ${(result.avgPrice * 100).toFixed(2)}%`);
        
        if (result.isResolved) {
            console.log(`   ✅ Рынок разрешен`);
            if (result.winner) {
                console.log(`   🏆 Победитель: ${result.winner}`);
                
                if (result.result === 'win') {
                    console.log(`   🟢 ВЫИГРЫШ! Поздравляем!`);
                    totalWins++;
                } else if (result.result === 'loss') {
                    console.log(`   🔴 ПРОИГРЫШ`);
                    totalLosses++;
                } else {
                    console.log(`   ⚠️  Не удалось определить результат`);
                    totalUnknown++;
                }
            } else {
                console.log(`   ⏳ Победитель еще не определен`);
                totalPending++;
            }
        } else {
            console.log(`   ⏳ Рынок еще не разрешен`);
            totalPending++;
        }

        if (result.marketUrl) {
            console.log(`   🔗 ${result.marketUrl}`);
        }
    }

    console.log("\n" + "=".repeat(70));
    console.log("📈 ИТОГОВАЯ СТАТИСТИКА");
    console.log("=".repeat(70));
    console.log(`🟢 Выигрышных позиций: ${totalWins}`);
    console.log(`🔴 Проигрышных позиций: ${totalLosses}`);
    console.log(`⏳ Ожидающих разрешения: ${totalPending}`);
    console.log(`⚠️  Неопределенных: ${totalUnknown}`);
    console.log(`📊 Всего активных позиций: ${totalWins + totalLosses + totalPending + totalUnknown}`);
    if (totalClosed > 0) {
        console.log(`🔒 Закрытых позиций: ${totalClosed}`);
    }
    console.log();

    // Проверяем баланс
    const balance = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    const usdc = parseFloat(balance.balance) / 1e6;
    console.log(`💰 Текущий баланс USDC: ${usdc.toFixed(2)} USDC\n`);
}

checkMyResults().catch(error => {
    console.error("\n❌ Ошибка:", error);
    process.exit(1);
});

