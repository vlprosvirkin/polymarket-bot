/**
 * Сервис для работы с Polymarket API
 * Объединяет данные из разных endpoints и типизирует запросы
 */

import { ClobClient } from "@polymarket/clob-client";
import { Market } from "../types/market";

/**
 * Расширенная информация о рынке с данными ликвидности
 */
export interface EnrichedMarket extends Market {
    // Данные о книге ордеров (orderbook)
    orderbook?: {
        bids: Array<{ price: string; size: string }>;
        asks: Array<{ price: string; size: string }>;
        spread: number;
        depth: number; // Глубина ликвидности
    };

    // Orderbook для NO токена (если нужен)
    noOrderbook?: {
        bids: Array<{ price: string; size: string }>;
        asks: Array<{ price: string; size: string }>;
        spread: number;
    };

    // Метрики ликвидности (рассчитанные из orderbook)
    liquidityMetrics?: {
        totalBidSize: number;  // Общий размер bid ордеров для YES
        totalAskSize: number;  // Общий размер ask ордеров для YES
        spreadPercent: number; // Спред в процентах для YES
        hasLiquidity: boolean; // Есть ли достаточная ликвидность
        
        // Ликвидность для NO токена (опционально)
        noTotalBidSize?: number;  // Общий размер bid ордеров для NO
        noTotalAskSize?: number;  // Общий размер ask ордеров для NO
        totalMarketLiquidity?: number; // Общая ликвидность рынка (YES + NO)
    };
}

/**
 * Параметры для получения рынков
 */
export interface GetMarketsParams {
    // Включить данные о книге ордеров
    includeOrderbook?: boolean;

    // Включить метрики ликвидности
    includeLiquidity?: boolean;

    // Фильтры
    minLiquidity?: number;  // Минимальная ликвидность (в USDC)
    maxSpread?: number;     // Максимальный спред (в процентах)
}

/**
 * Сервис для работы с данными Polymarket
 */
export class PolymarketDataService {
    private client: ClobClient;

    constructor(client: ClobClient) {
        this.client = client;
    }

    /**
     * Получение рынков с расширенными данными
     */
    async getEnrichedMarkets(params: GetMarketsParams = {}): Promise<EnrichedMarket[]> {
        // 1. Получаем базовые данные рынков
        const response = await this.client.getSamplingMarkets();

        if (!response.data) {
            throw new Error('API returned no data');
        }

        const markets: Market[] = response.data;
        console.log(`📊 Получено ${markets.length} рынков из API`);

        // 2. Обогащаем данными если требуется
        const enrichedMarkets: EnrichedMarket[] = [];

        for (const market of markets) {
            const enriched: EnrichedMarket = { ...market };

            // Добавляем данные о книге ордеров
            if (params.includeOrderbook && market.tokens) {
                try {
                    // Получаем orderbook для YES (и опционально для NO)
                    const orderbooks = await this.getOrderbookData(market, false); // Пока только YES
                    enriched.orderbook = orderbooks.yesOrderbook;
                    enriched.noOrderbook = orderbooks.noOrderbook;
                } catch (error) {
                    // Игнорируем ошибки для отдельных рынков
                }
            }

            // Вычисляем метрики ликвидности
            if (params.includeLiquidity && enriched.orderbook) {
                enriched.liquidityMetrics = this.calculateLiquidityMetrics(enriched.orderbook, enriched.noOrderbook);
            }

            enrichedMarkets.push(enriched);
        }

        // 3. Фильтруем по ликвидности если нужно
        let filtered = enrichedMarkets;

        if (params.minLiquidity !== undefined) {
            filtered = filtered.filter(m => {
                if (!m.liquidityMetrics) return false;
                const totalLiquidity = m.liquidityMetrics.totalBidSize + m.liquidityMetrics.totalAskSize;
                return totalLiquidity >= params.minLiquidity!;
            });
        }

        if (params.maxSpread !== undefined) {
            filtered = filtered.filter(m => {
                if (!m.liquidityMetrics) return false;
                return m.liquidityMetrics.spreadPercent <= params.maxSpread!;
            });
        }

        return filtered;
    }

    /**
     * Получение данных книги ордеров для рынка
     * 
     * В Polymarket каждый токен (YES и NO) имеет свой отдельный orderbook с bid/ask.
     * Bid для YES = цена покупки YES токена (ставка на то, что событие произойдет)
     * Ask для YES = цена продажи YES токена
     * 
     * Для полной оценки ликвидности нужно учитывать оба токена, особенно если стратегия
     * может торговать и YES и NO (например, для хеджирования).
     */
    private async getOrderbookData(market: Market, includeNo: boolean = false): Promise<{ yesOrderbook?: EnrichedMarket['orderbook']; noOrderbook?: EnrichedMarket['noOrderbook'] }> {
        if (!market.tokens || market.tokens.length === 0) {
            return {};
        }

        const yesToken = market.tokens.find(t => t.outcome === "Yes");
        const noToken = market.tokens.find(t => t.outcome === "No");

        const result: { yesOrderbook?: EnrichedMarket['orderbook']; noOrderbook?: EnrichedMarket['noOrderbook'] } = {};

        // Получаем orderbook для YES токена
        if (yesToken) {
            try {
                // В orderbook: bids = ордера на покупку YES, asks = ордера на продажу YES
                const yesOrderbook = await this.client.getOrderBook(yesToken.token_id);

                if (yesOrderbook.bids && yesOrderbook.asks && yesOrderbook.bids.length > 0 && yesOrderbook.asks.length > 0) {
                    const bestBid = yesOrderbook.bids[0] ? parseFloat(yesOrderbook.bids[0].price) : 0;
                    const bestAsk = yesOrderbook.asks[0] ? parseFloat(yesOrderbook.asks[0].price) : 1;
                    const spread = bestAsk - bestBid;
                    const depth = [...yesOrderbook.bids.slice(0, 5), ...yesOrderbook.asks.slice(0, 5)]
                        .reduce((sum, order) => sum + parseFloat(order.size), 0);

                    result.yesOrderbook = {
                        bids: yesOrderbook.bids.slice(0, 10),
                        asks: yesOrderbook.asks.slice(0, 10),
                        spread,
                        depth
                    };
                }
            } catch (error) {
                // Игнорируем ошибки для YES
            }
        }

        // Получаем orderbook для NO токена (если требуется)
        if (includeNo && noToken) {
            try {
                const noOrderbook = await this.client.getOrderBook(noToken.token_id);
                if (noOrderbook.bids && noOrderbook.asks && noOrderbook.bids.length > 0 && noOrderbook.asks.length > 0) {
                    const bestBid = noOrderbook.bids[0] ? parseFloat(noOrderbook.bids[0].price) : 0;
                    const bestAsk = noOrderbook.asks[0] ? parseFloat(noOrderbook.asks[0].price) : 1;
                    const spread = bestAsk - bestBid;

                    result.noOrderbook = {
                        bids: noOrderbook.bids.slice(0, 10),
                        asks: noOrderbook.asks.slice(0, 10),
                        spread
                    };
                }
            } catch (error) {
                // Игнорируем ошибки для NO
            }
        }

        return result;
    }

    /**
     * Вычисление метрик ликвидности из orderbook
     * 
     * Ликвидность = сумма всех ордеров в orderbook для токена
     * - totalBidSize: сумма всех ордеров на покупку (bids)
     * - totalAskSize: сумма всех ордеров на продажу (asks)
     * 
     * Учитываем и YES и NO токены, так как стратегии могут торговать обоими.
     * Общая ликвидность рынка = ликвидность YES + ликвидность NO
     */
    private calculateLiquidityMetrics(
        yesOrderbook: NonNullable<EnrichedMarket['orderbook']>,
        noOrderbook?: EnrichedMarket['noOrderbook']
    ): EnrichedMarket['liquidityMetrics'] {
        // Ликвидность для YES токена
        const yesTotalBidSize = yesOrderbook.bids.reduce((sum, bid) =>
            sum + parseFloat(bid.size), 0
        );
        const yesTotalAskSize = yesOrderbook.asks.reduce((sum, ask) =>
            sum + parseFloat(ask.size), 0
        );

        // Ликвидность для NO токена (если есть)
        let noTotalBidSize = 0;
        let noTotalAskSize = 0;
        if (noOrderbook) {
            noTotalBidSize = noOrderbook.bids.reduce((sum, bid) =>
                sum + parseFloat(bid.size), 0
            );
            noTotalAskSize = noOrderbook.asks.reduce((sum, ask) =>
                sum + parseFloat(ask.size), 0
            );
        }

        // Общая ликвидность рынка = YES + NO
        const totalBidSize = yesTotalBidSize; // Для обратной совместимости
        const totalAskSize = yesTotalAskSize; // Для обратной совместимости
        const totalMarketLiquidity = yesTotalBidSize + yesTotalAskSize + noTotalBidSize + noTotalAskSize;

        const bestBid = yesOrderbook.bids.length > 0 && yesOrderbook.bids[0] ? parseFloat(yesOrderbook.bids[0].price) : 0;
        const bestAsk = yesOrderbook.asks.length > 0 && yesOrderbook.asks[0] ? parseFloat(yesOrderbook.asks[0].price) : 1;

        // Для рынков предсказаний используем абсолютный спред в процентных пунктах
        // Это более корректно когда цена близка к 0% или 100%
        // Например: bid=1%, ask=99% → spread = 98 процентных пунктов
        const spreadPercent = Math.abs(bestAsk - bestBid) * 100;

        // Проверка наличия минимальной ликвидности
        // Используем общую ликвидность рынка (YES + NO), если доступна
        const liquidityToCheck = totalMarketLiquidity > 0 ? totalMarketLiquidity : (totalBidSize + totalAskSize);
        const minLiquidityForHasLiquidity = 100; // Минимум для hasLiquidity флага
        const hasLiquidity = liquidityToCheck >= minLiquidityForHasLiquidity;

        return {
            totalBidSize,  // YES bid ликвидность (для обратной совместимости)
            totalAskSize,  // YES ask ликвидность (для обратной совместимости)
            spreadPercent,
            hasLiquidity,
            // Дополнительные метрики для NO
            ...(noOrderbook ? {
                noTotalBidSize,
                noTotalAskSize,
                totalMarketLiquidity // Общая ликвидность рынка (YES + NO)
            } : {})
        };
    }

    /**
     * Получение детальной информации о конкретном рынке
     */
    async getMarketDetails(conditionId: string): Promise<EnrichedMarket | null> {
        try {
            const market = await this.client.getMarket(conditionId);

            const enriched: EnrichedMarket = market;

            // Добавляем orderbook для YES и NO (так как стратегии могут торговать обоими)
            if (market.tokens && market.tokens.length > 0) {
                const orderbooks = await this.getOrderbookData(market, true); // Получаем и YES и NO
                enriched.orderbook = orderbooks.yesOrderbook;
                enriched.noOrderbook = orderbooks.noOrderbook;

                if (enriched.orderbook) {
                    enriched.liquidityMetrics = this.calculateLiquidityMetrics(enriched.orderbook, enriched.noOrderbook);
                }
            }

            return enriched;
        } catch (error) {
            console.error(`Ошибка получения рынка ${conditionId}:`, error);
            return null;
        }
    }

    /**
     * Быстрая проверка ликвидности для списка рынков
     * Использует параллельные запросы для ускорения
     */
    async checkLiquidityBatch(markets: Market[], minLiquidity: number = 100): Promise<Map<string, boolean>> {
        const results = new Map<string, boolean>();

        // Обрабатываем батчами по 10 рынков
        const batchSize = 10;
        for (let i = 0; i < markets.length; i += batchSize) {
            const batch = markets.slice(i, i + batchSize);

            const promises = batch.map(async (market) => {
                if (!market.tokens || market.tokens.length === 0) {
                    return { conditionId: market.condition_id, hasLiquidity: false };
                }

                const yesToken = market.tokens.find(t => t.outcome === "Yes");
                if (!yesToken) {
                    return { conditionId: market.condition_id, hasLiquidity: false };
                }

                try {
                    const orderbook = await this.client.getOrderBook(yesToken.token_id);

                    if (!orderbook.bids || !orderbook.asks) {
                        return { conditionId: market.condition_id, hasLiquidity: false };
                    }

                    const bids = orderbook.bids;
                    const asks = orderbook.asks;

                    if (bids.length === 0 || asks.length === 0) {
                        return { conditionId: market.condition_id, hasLiquidity: false };
                    }

                    const totalSize = [...bids.slice(0, 5), ...asks.slice(0, 5)]
                        .reduce((sum, order) => sum + parseFloat(order.size), 0);

                    return {
                        conditionId: market.condition_id,
                        hasLiquidity: totalSize >= minLiquidity
                    };
                } catch (error) {
                    return { conditionId: market.condition_id, hasLiquidity: false };
                }
            });

            const batchResults = await Promise.all(promises);
            batchResults.forEach(result => {
                results.set(result.conditionId, result.hasLiquidity);
            });

            // Небольшая задержка между батчами чтобы не перегрузить API
            if (i + batchSize < markets.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        return results;
    }

    /**
     * Получение статистики по ликвидности рынков
     * Возвращает только количество рынков с/без ликвидности
     * Для детальной статистики используйте MarketFilter.getEnrichedMarketStats()
     */
    async getLiquidityStats(markets: Market[], minLiquidity: number = 100): Promise<{
        total: number;
        withLiquidity: number;
        withoutLiquidity: number;
    }> {
        const liquidityMap = await this.checkLiquidityBatch(markets, minLiquidity);

        let withLiquidity = 0;

        for (const [_, hasLiq] of liquidityMap) {
            if (hasLiq) {
                withLiquidity++;
            }
        }

        return {
            total: markets.length,
            withLiquidity,
            withoutLiquidity: markets.length - withLiquidity
        };
    }
}
