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

    // Метрики ликвидности (рассчитанные из orderbook)
    liquidityMetrics?: {
        totalBidSize: number;  // Общий размер bid ордеров
        totalAskSize: number;  // Общий размер ask ордеров
        spreadPercent: number; // Спред в процентах
        hasLiquidity: boolean; // Есть ли достаточная ликвидность
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
        const markets: Market[] = response.data || [];

        console.log(`📊 Получено ${markets.length} рынков из API`);

        // 2. Обогащаем данными если требуется
        const enrichedMarkets: EnrichedMarket[] = [];

        for (const market of markets) {
            const enriched: EnrichedMarket = { ...market };

            // Добавляем данные о книге ордеров
            if (params.includeOrderbook && market.tokens) {
                try {
                    enriched.orderbook = await this.getOrderbookData(market);
                } catch (error) {
                    // Игнорируем ошибки для отдельных рынков
                }
            }

            // Вычисляем метрики ликвидности
            if (params.includeLiquidity && enriched.orderbook) {
                enriched.liquidityMetrics = this.calculateLiquidityMetrics(enriched.orderbook);
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
     */
    private async getOrderbookData(market: Market): Promise<EnrichedMarket['orderbook']> {
        if (!market.tokens || market.tokens.length === 0) {
            return undefined;
        }

        const yesToken = market.tokens.find(t => t.outcome === "Yes");
        if (!yesToken) {
            return undefined;
        }

        try {
            const orderbook = await this.client.getOrderBook(yesToken.token_id);

            // Парсим bids и asks
            const bids = orderbook.bids || [];
            const asks = orderbook.asks || [];

            // Вычисляем spread
            const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0;
            const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : 1;
            const spread = bestAsk - bestBid;

            // Вычисляем глубину (сумма размеров на первых 5 уровнях)
            const depth = [...bids.slice(0, 5), ...asks.slice(0, 5)]
                .reduce((sum, order) => sum + parseFloat(order.size), 0);

            return {
                bids: bids.slice(0, 10), // Топ-10 bid ордеров
                asks: asks.slice(0, 10), // Топ-10 ask ордеров
                spread,
                depth
            };
        } catch (error) {
            return undefined;
        }
    }

    /**
     * Вычисление метрик ликвидности из orderbook
     */
    private calculateLiquidityMetrics(orderbook: NonNullable<EnrichedMarket['orderbook']>): EnrichedMarket['liquidityMetrics'] {
        const totalBidSize = orderbook.bids.reduce((sum, bid) =>
            sum + parseFloat(bid.size), 0
        );

        const totalAskSize = orderbook.asks.reduce((sum, ask) =>
            sum + parseFloat(ask.size), 0
        );

        const bestBid = orderbook.bids.length > 0 ? parseFloat(orderbook.bids[0].price) : 0;
        const bestAsk = orderbook.asks.length > 0 ? parseFloat(orderbook.asks[0].price) : 1;

        const spreadPercent = ((bestAsk - bestBid) / bestBid) * 100;

        // Считаем что есть ликвидность если хотя бы $100 в книге
        const hasLiquidity = (totalBidSize + totalAskSize) >= 100;

        return {
            totalBidSize,
            totalAskSize,
            spreadPercent,
            hasLiquidity
        };
    }

    /**
     * Получение детальной информации о конкретном рынке
     */
    async getMarketDetails(conditionId: string): Promise<EnrichedMarket | null> {
        try {
            const market = await this.client.getMarket(conditionId);

            const enriched: EnrichedMarket = market;

            // Добавляем orderbook
            if (market.tokens && market.tokens.length > 0) {
                enriched.orderbook = await this.getOrderbookData(market);

                if (enriched.orderbook) {
                    enriched.liquidityMetrics = this.calculateLiquidityMetrics(enriched.orderbook);
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
                    const bids = orderbook.bids || [];
                    const asks = orderbook.asks || [];

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
     */
    async getLiquidityStats(markets: Market[]): Promise<{
        total: number;
        withLiquidity: number;
        withoutLiquidity: number;
        avgLiquidity: number;
        maxLiquidity: number;
    }> {
        const liquidityMap = await this.checkLiquidityBatch(markets);

        let totalLiquidity = 0;
        let withLiquidity = 0;
        let maxLiquidity = 0;

        for (const [_, hasLiq] of liquidityMap) {
            if (hasLiq) {
                withLiquidity++;
                // TODO: можно добавить получение точных значений
            }
        }

        return {
            total: markets.length,
            withLiquidity,
            withoutLiquidity: markets.length - withLiquidity,
            avgLiquidity: 0, // TODO
            maxLiquidity: 0  // TODO
        };
    }
}
