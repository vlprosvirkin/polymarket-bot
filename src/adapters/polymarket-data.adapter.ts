/**
 * Polymarket Data API Adapter
 *
 * Адаптер для работы с данными Polymarket API
 * Объединяет данные из разных endpoints и типизирует запросы
 */

import { ClobClient } from "@polymarket/clob-client";
import { Market } from "../types/market";

/**
 * Orderbook данные
 */
export interface OrderbookData {
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
    spread: number;
    depth: number;
}

/**
 * Метрики ликвидности
 */
export interface LiquidityMetrics {
    totalBidSize: number;
    totalAskSize: number;
    spreadPercent: number;
    hasLiquidity: boolean;
    noTotalBidSize?: number;
    noTotalAskSize?: number;
    totalMarketLiquidity?: number;
}

/**
 * Расширенная информация о рынке
 */
export interface EnrichedMarket extends Market {
    orderbook?: OrderbookData;
    noOrderbook?: Omit<OrderbookData, 'depth'>;
    liquidityMetrics?: LiquidityMetrics;
}

/**
 * Параметры для получения рынков
 */
export interface GetMarketsParams {
    includeOrderbook?: boolean;
    includeLiquidity?: boolean;
    minLiquidity?: number;
    maxSpread?: number;
}

/**
 * Polymarket Data API Adapter
 *
 * @example
 * ```typescript
 * const adapter = new PolymarketDataAdapter(clobClient);
 * const markets = await adapter.getEnrichedMarkets({ includeLiquidity: true });
 * const details = await adapter.getMarketDetails(conditionId);
 * ```
 */
export class PolymarketDataAdapter {
    private client: ClobClient;

    constructor(client: ClobClient) {
        this.client = client;
    }

    /**
     * Получение рынков с расширенными данными
     */
    async getEnrichedMarkets(params: GetMarketsParams = {}): Promise<EnrichedMarket[]> {
        const response = await this.client.getSamplingMarkets();

        if (!response.data) {
            throw new Error('API returned no data');
        }

        const markets: Market[] = response.data as Market[];
        console.warn(`📊 Получено ${markets.length} рынков из API`);

        const enrichedMarkets: EnrichedMarket[] = [];

        for (const market of markets) {
            const enriched: EnrichedMarket = { ...market };

            if (params.includeOrderbook && market.tokens) {
                try {
                    const orderbooks = await this.getOrderbookData(market, false);
                    enriched.orderbook = orderbooks.yesOrderbook;
                    enriched.noOrderbook = orderbooks.noOrderbook;
                } catch {
                    // Игнорируем ошибки для отдельных рынков
                }
            }

            if (params.includeLiquidity && enriched.orderbook) {
                enriched.liquidityMetrics = this.calculateLiquidityMetrics(enriched.orderbook, enriched.noOrderbook);
            }

            enrichedMarkets.push(enriched);
        }

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
     * Вычисление глубины orderbook
     */
    private calculateDepth(bids: Array<{ price: string; size: string }>, asks: Array<{ price: string; size: string }>): number {
        return [...bids.slice(0, 5), ...asks.slice(0, 5)]
            .reduce((sum, order) => sum + parseFloat(order.size), 0);
    }

    /**
     * Создание OrderbookData из ответа API
     */
    private createOrderbookData(
        orderbook: { bids: Array<{ price: string; size: string }>; asks: Array<{ price: string; size: string }> }
    ): OrderbookData {
        const bestBid = orderbook.bids[0] ? parseFloat(orderbook.bids[0].price) : 0;
        const bestAsk = orderbook.asks[0] ? parseFloat(orderbook.asks[0].price) : 1;
        const spread = bestAsk - bestBid;
        const depth = this.calculateDepth(orderbook.bids, orderbook.asks);

        return {
            bids: orderbook.bids.slice(0, 10),
            asks: orderbook.asks.slice(0, 10),
            spread,
            depth
        };
    }

    /**
     * Получение YES orderbook
     */
    private async getYesOrderbook(tokenId: string): Promise<OrderbookData | undefined> {
        try {
            const yesOrderbook = await this.client.getOrderBook(tokenId);
            if (yesOrderbook.bids && yesOrderbook.asks && yesOrderbook.bids.length > 0 && yesOrderbook.asks.length > 0) {
                return this.createOrderbookData(yesOrderbook);
            }
        } catch {
            // Игнорируем ошибки для YES
        }
        return undefined;
    }

    /**
     * Получение NO orderbook
     */
    private async getNoOrderbook(tokenId: string): Promise<Omit<OrderbookData, 'depth'> | undefined> {
        try {
            const noOrderbook = await this.client.getOrderBook(tokenId);
            if (noOrderbook.bids && noOrderbook.asks && noOrderbook.bids.length > 0 && noOrderbook.asks.length > 0) {
                const bestBid = noOrderbook.bids[0] ? parseFloat(noOrderbook.bids[0].price) : 0;
                const bestAsk = noOrderbook.asks[0] ? parseFloat(noOrderbook.asks[0].price) : 1;
                const spread = bestAsk - bestBid;

                return {
                    bids: noOrderbook.bids.slice(0, 10),
                    asks: noOrderbook.asks.slice(0, 10),
                    spread
                };
            }
        } catch {
            // Игнорируем ошибки для NO
        }
        return undefined;
    }

    /**
     * Получение данных книги ордеров для рынка
     */
    private async getOrderbookData(market: Market, includeNo: boolean = false): Promise<{
        yesOrderbook?: OrderbookData;
        noOrderbook?: Omit<OrderbookData, 'depth'>;
    }> {
        if (!market.tokens || market.tokens.length === 0) {
            return {};
        }

        const yesToken = market.tokens.find(t => t.outcome === "Yes");
        const noToken = market.tokens.find(t => t.outcome === "No");

        const result: {
            yesOrderbook?: OrderbookData;
            noOrderbook?: Omit<OrderbookData, 'depth'>;
        } = {};

        if (yesToken) {
            result.yesOrderbook = await this.getYesOrderbook(yesToken.token_id);
        }

        if (includeNo && noToken) {
            result.noOrderbook = await this.getNoOrderbook(noToken.token_id);
        }

        return result;
    }

    /**
     * Вычисление метрик ликвидности из orderbook
     */
    private calculateLiquidityMetrics(
        yesOrderbook: OrderbookData,
        noOrderbook?: Omit<OrderbookData, 'depth'>
    ): LiquidityMetrics {
        const yesTotalBidSize = yesOrderbook.bids.reduce((sum, bid) =>
            sum + parseFloat(bid.size), 0
        );
        const yesTotalAskSize = yesOrderbook.asks.reduce((sum, ask) =>
            sum + parseFloat(ask.size), 0
        );

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

        const totalBidSize = yesTotalBidSize;
        const totalAskSize = yesTotalAskSize;
        const totalMarketLiquidity = yesTotalBidSize + yesTotalAskSize + noTotalBidSize + noTotalAskSize;

        const bestBid = yesOrderbook.bids.length > 0 && yesOrderbook.bids[0] ? parseFloat(yesOrderbook.bids[0].price) : 0;
        const bestAsk = yesOrderbook.asks.length > 0 && yesOrderbook.asks[0] ? parseFloat(yesOrderbook.asks[0].price) : 1;
        const spreadPercent = Math.abs(bestAsk - bestBid) * 100;

        const liquidityToCheck = totalMarketLiquidity > 0 ? totalMarketLiquidity : (totalBidSize + totalAskSize);
        const minLiquidityForHasLiquidity = 100;
        const hasLiquidity = liquidityToCheck >= minLiquidityForHasLiquidity;

        return {
            totalBidSize,
            totalAskSize,
            spreadPercent,
            hasLiquidity,
            ...(noOrderbook ? {
                noTotalBidSize,
                noTotalAskSize,
                totalMarketLiquidity
            } : {})
        };
    }

    /**
     * Получение детальной информации о рынке
     */
    async getMarketDetails(conditionId: string): Promise<EnrichedMarket | null> {
        try {
            const market = await this.client.getMarket(conditionId) as Market;

            const enriched: EnrichedMarket = market as EnrichedMarket;

            if (market.tokens && market.tokens.length > 0) {
                const orderbooks = await this.getOrderbookData(market, true);
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
     * Проверка ликвидности для списка рынков
     */
    async checkLiquidityBatch(markets: Market[], minLiquidity: number = 100): Promise<Map<string, boolean>> {
        const results = new Map<string, boolean>();
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
                } catch {
                    return { conditionId: market.condition_id, hasLiquidity: false };
                }
            });

            const batchResults = await Promise.all(promises);
            batchResults.forEach(result => {
                results.set(result.conditionId, result.hasLiquidity);
            });

            if (i + batchSize < markets.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        return results;
    }

    /**
     * Статистика по ликвидности рынков
     */
    async getLiquidityStats(markets: Market[], minLiquidity: number = 100): Promise<{
        total: number;
        withLiquidity: number;
        withoutLiquidity: number;
    }> {
        const liquidityMap = await this.checkLiquidityBatch(markets, minLiquidity);

        let withLiquidity = 0;

        for (const [, hasLiq] of liquidityMap) {
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

    /**
     * Получение orderbook для токена
     */
    async getOrderbook(tokenId: string): Promise<OrderbookData | null> {
        try {
            const orderbook = await this.client.getOrderBook(tokenId);

            if (!orderbook.bids || !orderbook.asks || orderbook.bids.length === 0 || orderbook.asks.length === 0) {
                return null;
            }

            const firstBid = orderbook.bids[0];
            const firstAsk = orderbook.asks[0];
            if (!firstBid || !firstAsk) {
                return null;
            }

            const bestBid = parseFloat(firstBid.price);
            const bestAsk = parseFloat(firstAsk.price);
            const spread = bestAsk - bestBid;
            const depth = [...orderbook.bids.slice(0, 5), ...orderbook.asks.slice(0, 5)]
                .reduce((sum, order) => sum + parseFloat(order.size), 0);

            return {
                bids: orderbook.bids.slice(0, 10),
                asks: orderbook.asks.slice(0, 10),
                spread,
                depth
            };
        } catch (error) {
            console.error(`Ошибка получения orderbook для ${tokenId}:`, error);
            return null;
        }
    }

    /**
     * Получение midpoint цены для токена
     */
    async getMidpoint(tokenId: string): Promise<number | null> {
        try {
            const midpoint: unknown = await this.client.getMidpoint(tokenId);
            if (typeof midpoint === 'number') {
                return midpoint;
            }
            if (typeof midpoint === 'string') {
                return parseFloat(midpoint);
            }
            return null;
        } catch {
            return null;
        }
    }
}
