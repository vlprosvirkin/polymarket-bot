/**
 * Positions Service
 * 
 * Сервис для получения информации о текущих позициях, ставках и рынках
 */

import { ClobClient } from '@polymarket/clob-client';
import { GammaApiAdapter, GammaMarket } from '../adapters/gamma-api';
import { Market, MarketToken } from '../types/market';

export interface PositionInfo {
    tokenId: string;
    conditionId?: string;
    marketQuestion?: string;
    outcome: 'Yes' | 'No';
    side: 'BUY' | 'SELL';
    positionType: 'LONG' | 'SHORT';
    size: number;  // Всегда положительное (абсолютное значение)
    avgPrice: number;
    currentPrice?: number;
    isResolved: boolean;
    winner?: 'Yes' | 'No';
    result: 'win' | 'loss' | 'pending' | 'unknown';
    marketUrl?: string;
    pnl?: number;
    pnlPercent?: number;
}

export interface MarketInfo {
    conditionId: string;
    question: string;
    category?: string;
    endDate?: string;
    active: boolean;
    closed: boolean;
    resolved: boolean;
    winner?: 'Yes' | 'No';
    outcomes: string[];
    tokens: {
        tokenId: string;
        outcome: string;
        price?: number;
        winner?: boolean;
    }[];
    marketUrl: string;
}

export interface WalletPositionsSummary {
    positions: PositionInfo[];
    markets: MarketInfo[];
    summary: {
        totalPositions: number;
        winningPositions: number;
        losingPositions: number;
        pendingPositions: number;
        totalPnL: number;
        totalPnLPercent: number;
        longPositions: number;
        shortPositions: number;
        resolvedPnL: number;
        unrealizedPnL: number;
    };
    filters?: {
        positionType?: 'LONG' | 'SHORT';
        result?: 'win' | 'loss' | 'pending';
        resolved?: boolean;
    };
}

// Константы
const MIN_POSITION_SIZE = 0.01; // Минимальный размер позиции для учета

/**
 * Positions Service
 * 
 * Сервис для получения информации о позициях кошелька
 * 
 * @example
 * ```typescript
 * const service = new PositionsService(clobClient);
 * const summary = await service.getWalletPositions();
 * ```
 */
export class PositionsService {
    private gammaAdapter: GammaApiAdapter;

    constructor(private clobClient: ClobClient) {
        this.gammaAdapter = new GammaApiAdapter();
    }

    /**
     * Получить полную информацию о позициях кошелька
     * 
     * @returns Сводка по позициям, рынкам и статистика
     */
    async getWalletPositions(filters?: {
        positionType?: 'LONG' | 'SHORT';
        result?: 'win' | 'loss' | 'pending';
        resolved?: boolean;
    }): Promise<WalletPositionsSummary> {
        // Получаем все сделки
        const trades = await this.clobClient.getTrades({});
        
        // Группируем сделки по токенам для расчета позиций
        const tokenPositions = this.calculatePositionsFromTrades(trades);
        
        // Получаем информацию о рынках
        const marketsMap = await this.getMarketsInfo(tokenPositions);
        
        // Обогащаем позиции информацией о рынках
        let enrichedPositions = await this.enrichPositionsWithMarketInfo(
            tokenPositions,
            marketsMap
        );

        // Применяем фильтры
        if (filters) {
            if (filters.positionType) {
                enrichedPositions = enrichedPositions.filter(p => p.positionType === filters.positionType);
            }
            if (filters.result) {
                enrichedPositions = enrichedPositions.filter(p => p.result === filters.result);
            }
            if (filters.resolved !== undefined) {
                enrichedPositions = enrichedPositions.filter(p => p.isResolved === filters.resolved);
            }
        }

        // Сортируем позиции: сначала по результату (win/loss/pending), потом по P&L
        const sortedPositions = enrichedPositions.sort((a, b) => {
            // Сначала по результату: win > loss > pending > unknown
            const resultOrder: Record<'win' | 'loss' | 'pending' | 'unknown', number> = {
                win: 0,
                loss: 1,
                pending: 2,
                unknown: 3
            };
            const aOrder = resultOrder[a.result];
            const bOrder = resultOrder[b.result];
            const resultDiff = aOrder - bOrder;
            if (resultDiff !== 0) return resultDiff;
            
            // Потом по P&L (лучшие первыми)
            const pnlA = a.pnl ?? 0;
            const pnlB = b.pnl ?? 0;
            return pnlB - pnlA;
        });

        // Группируем уникальные рынки
        const uniqueMarkets = await this.extractUniqueMarkets(sortedPositions, marketsMap);
        
        // Рассчитываем статистику
        const summary = this.calculateSummary(sortedPositions);

        return {
            positions: sortedPositions,
            markets: uniqueMarkets,
            summary,
            filters
        };
    }

    /**
     * Получить информацию о конкретной позиции по токену
     * 
     * @param tokenId - Token ID
     * @returns Информация о позиции или null
     */
    async getPositionByTokenId(tokenId: string): Promise<PositionInfo | null> {
        const trades = await this.clobClient.getTrades({});
        const tokenTrades = trades.filter(t => t.asset_id === tokenId);
        
        if (tokenTrades.length === 0) {
            return null;
        }
        
        const position = this.calculatePositionFromTrades(tokenId, tokenTrades);
        const marketInfo = await this.getMarketInfoForToken(tokenId);
        
        if (marketInfo) {
            position.conditionId = marketInfo.conditionId;
            position.marketQuestion = marketInfo.question;
            position.isResolved = marketInfo.closed;
            
            // Определяем outcome по позиции токена в массиве
            if (marketInfo.clobTokenIds && marketInfo.clobTokenIds.length > 0) {
                const tokenIndex = marketInfo.clobTokenIds.indexOf(tokenId);
                if (tokenIndex >= 0 && marketInfo.outcomes && marketInfo.outcomes.length > tokenIndex) {
                    position.outcome = marketInfo.outcomes[tokenIndex] === 'Yes' ? 'Yes' : 'No';
                }
            }
            
            // Если не нашли, используем логику из позиции
            if (!position.outcome) {
                position.outcome = this.determineOutcomeFromPosition(position);
            }
            
            // Получаем информацию о разрешении
            if (marketInfo.conditionId) {
                const resolution = await this.gammaAdapter.getMarketResolution(
                    marketInfo.conditionId
                );
                if (resolution) {
                    position.winner = resolution.winner;
                    position.isResolved = resolution.resolved;
                }
            }
            
            // Определяем результат
            position.result = this.determineResult(position);
            
            if (position.conditionId) {
                position.marketUrl = `https://polymarket.com/event/${position.conditionId}`;
            }
        }
        
        return position;
    }

    /**
     * Получить информацию о рынках для списка токенов
     * Оптимизировано: батч-запросы вместо N+1 проблемы
     */
    private async getMarketsInfo(positions: Map<string, PositionInfo>): Promise<Map<string, { gamma: GammaMarket; clob: Market }>> {
        const marketsMap = new Map<string, { gamma: GammaMarket; clob: Market }>();
        
        // Получаем все рынки из CLOB API
        const clobMarkets = await this.clobClient.getSamplingMarkets();
        const tokenToMarketMap = new Map<string, { market: Market; token: MarketToken }>();
        const conditionIdsToFetch = new Set<string>();
        
        // Создаем маппинг токен -> рынок из CLOB
        for (const market of clobMarkets.data || []) {
            if (market.tokens) {
                for (const token of market.tokens) {
                    tokenToMarketMap.set(token.token_id, { market, token });
                    
                    const position = positions.get(token.token_id);
                    if (position) {
                        // Устанавливаем conditionId и outcome из CLOB
                        position.conditionId = market.condition_id;
                        position.outcome = token.outcome as 'Yes' | 'No';
                        
                        // Собираем condition_id для батч-запроса
                        if (!marketsMap.has(market.condition_id)) {
                            conditionIdsToFetch.add(market.condition_id);
                        }
                    }
                }
            }
        }
        
        // Для позиций, у которых outcome еще не определен из CLOB, пробуем найти через tokenToMarketMap
        for (const [tokenId, position] of positions.entries()) {
            const marketTokenInfo = tokenToMarketMap.get(tokenId);
            if (marketTokenInfo) {
                position.conditionId = marketTokenInfo.market.condition_id;
                position.outcome = marketTokenInfo.token.outcome as 'Yes' | 'No';
                
                if (!marketsMap.has(marketTokenInfo.market.condition_id)) {
                    conditionIdsToFetch.add(marketTokenInfo.market.condition_id);
                }
            }
        }
        
        // БАТЧ-ЗАПРОС: получаем все Gamma markets параллельно
        const gammaMarketPromises = Array.from(conditionIdsToFetch).map(async (conditionId) => {
            try {
                const gammaMarket = await this.gammaAdapter.getMarketByConditionId(conditionId);
                return { conditionId, gammaMarket };
            } catch (error) {
                // Игнорируем ошибки отдельных запросов
                return { conditionId, gammaMarket: null };
            }
        });
        
        const gammaResults = await Promise.all(gammaMarketPromises);
        
        // Заполняем marketsMap из результатов батч-запроса
        for (const { conditionId, gammaMarket } of gammaResults) {
            const clobMarket = clobMarkets.data?.find(m => m.condition_id === conditionId);
            if (clobMarket) {
                if (gammaMarket) {
                    marketsMap.set(conditionId, { gamma: gammaMarket, clob: clobMarket });
                } else {
                    // Если не нашли в Gamma, все равно сохраняем CLOB market
                    marketsMap.set(conditionId, { 
                        gamma: { conditionId } as GammaMarket, 
                        clob: clobMarket 
                    });
                }
            }
        }
        
        // Для позиций, которых нет в выборке CLOB, пробуем найти через Gamma API (тоже батч)
        const missingTokenIds = Array.from(positions.entries())
            .filter(([_, position]) => !position.conditionId)
            .map(([tokenId]) => tokenId);
        
        if (missingTokenIds.length > 0) {
            const missingGammaPromises = missingTokenIds.map(async (tokenId) => {
                try {
                    const gammaMarket = await this.gammaAdapter.getMarketByTokenId(tokenId);
                    return { tokenId, gammaMarket };
                } catch {
                    return { tokenId, gammaMarket: null };
                }
            });
            
            const missingResults = await Promise.all(missingGammaPromises);
            
            for (const { tokenId, gammaMarket } of missingResults) {
                if (gammaMarket) {
                    const position = positions.get(tokenId);
                    if (position) {
                        position.conditionId = gammaMarket.conditionId;
                    }
                    marketsMap.set(gammaMarket.conditionId, { 
                        gamma: gammaMarket, 
                        clob: { condition_id: gammaMarket.conditionId } as Market 
                    });
                }
            }
        }
        
        return marketsMap;
    }

    /**
     * Получить информацию о рынке для конкретного токена
     */
    private async getMarketInfoForToken(tokenId: string): Promise<GammaMarket | null> {
        // Сначала пробуем через CLOB API
        const clobMarkets = await this.clobClient.getSamplingMarkets();
        for (const market of clobMarkets.data || []) {
            if (market.tokens?.some((t: MarketToken) => t.token_id === tokenId)) {
                return await this.gammaAdapter.getMarketByConditionId(market.condition_id);
            }
        }
        
        // Если не нашли, пробуем через Gamma API
        return await this.gammaAdapter.getMarketByTokenId(tokenId);
    }

    /**
     * Рассчитать позиции из сделок
     */
    private calculatePositionsFromTrades(trades: Array<{ asset_id: string; side: string; size: string; price: string }>): Map<string, PositionInfo> {
        const positions = new Map<string, PositionInfo>();

        for (const trade of trades) {
            const tokenId = trade.asset_id;
            const size = parseFloat(trade.size);
            const price = parseFloat(trade.price);

            let position = positions.get(tokenId);
            if (!position) {
                position = {
                    tokenId,
                    outcome: 'Yes', // Default, будет перезаписано
                    side: trade.side as 'BUY' | 'SELL',
                    positionType: this.getPositionType(trade.side as 'BUY' | 'SELL'),
                    size: 0,
                    avgPrice: 0,
                    isResolved: false,
                    result: 'unknown',
                };
                positions.set(tokenId, position);
            }

            // Обновляем позицию
            if (trade.side === 'BUY') {
                const totalCost = position.size * position.avgPrice + size * price;
                position.size += size;
                position.avgPrice = position.size > 0 ? totalCost / position.size : price;
            } else {
                // SELL - SHORT позиция
                const totalCost = position.size * position.avgPrice + size * price;
                position.size -= size;
                position.avgPrice = position.size !== 0 ? totalCost / position.size : price;
            }
        }

        // Нормализуем size (всегда положительное) и обновляем positionType
        for (const [_tokenId, position] of positions.entries()) {
            position.size = Math.abs(position.size);
            position.positionType = this.getPositionType(position.side);
        }

        return positions;
    }

    /**
     * Рассчитать позицию из списка сделок для одного токена
     */
    private calculatePositionFromTrades(tokenId: string, trades: Array<{ side: string; size: string; price: string }>): PositionInfo {
        let size = 0;
        let totalCost = 0;
        let side: 'BUY' | 'SELL' = 'BUY'; // Default to BUY, will be updated by first trade

        for (const trade of trades) {
            const tradeSize = parseFloat(trade.size);
            const tradePrice = parseFloat(trade.price);

            if (trade.side === 'BUY') {
                totalCost += tradeSize * tradePrice;
                size += tradeSize;
                side = 'BUY';
            } else {
                totalCost += tradeSize * tradePrice;
                size -= tradeSize;
                side = 'SELL';
            }
        }

        const avgPrice = Math.abs(size) > 0 ? totalCost / Math.abs(size) : 0;

        return {
            tokenId,
            outcome: 'Yes', // Default, будет перезаписано
            side,
            positionType: this.getPositionType(side),
            size: Math.abs(size), // Всегда положительное
            avgPrice,
            isResolved: false,
            result: 'unknown',
        };
    }

    /**
     * Определяет тип позиции на основе стороны сделки.
     * В контексте Polymarket, BUY обычно означает LONG, а SELL - SHORT.
     */
    private getPositionType(side: 'BUY' | 'SELL'): 'LONG' | 'SHORT' {
        return side === 'BUY' ? 'LONG' : 'SHORT';
    }

    /**
     * Определить outcome из позиции (вынесено для устранения дублирования)
     */
    private determineOutcomeFromPosition(position: PositionInfo): 'Yes' | 'No' {
        return position.positionType === 'SHORT' ? 'No' : 'Yes';
    }

    /**
     * Обогатить позиции информацией о рынках
     * Оптимизировано: батч-запросы для разрешений и цен
     */
    private async enrichPositionsWithMarketInfo(
        positions: Map<string, PositionInfo>,
        marketsMap: Map<string, { gamma: GammaMarket; clob: Market }>
    ): Promise<PositionInfo[]> {
        const enriched: PositionInfo[] = [];
        const conditionIdsToResolve = new Set<string>();
        const tokenIdsForPrice = new Set<string>();
        
        // Создаем обратный индекс: tokenId -> marketInfo для быстрого поиска
        const tokenToMarketIndex = new Map<string, { gamma: GammaMarket; clob: Market; conditionId: string }>();
        for (const [conditionId, marketInfo] of marketsMap.entries()) {
            if (marketInfo.gamma.clobTokenIds) {
                for (const tokenId of marketInfo.gamma.clobTokenIds) {
                    tokenToMarketIndex.set(tokenId, { ...marketInfo, conditionId });
                }
            }
        }
        
        // Собираем данные для батч-запросов
        for (const [tokenId, position] of positions.entries()) {
            // Пропускаем закрытые позиции
            if (Math.abs(position.size) < MIN_POSITION_SIZE) {
                continue;
            }
            
            // Ищем рынок для этого токена (используем индекс)
            let marketInfo: { gamma: GammaMarket; clob: Market; conditionId: string } | undefined;
            
            if (position.conditionId) {
                const market = marketsMap.get(position.conditionId);
                if (market) {
                    marketInfo = { ...market, conditionId: position.conditionId };
                }
            } else {
                // Используем обратный индекс для быстрого поиска
                marketInfo = tokenToMarketIndex.get(tokenId);
                if (marketInfo) {
                    position.conditionId = marketInfo.conditionId;
                }
            }
            
            if (marketInfo) {
                const { gamma, clob } = marketInfo;
                position.marketQuestion = gamma.question;
                position.conditionId = gamma.conditionId;
                position.isResolved = gamma.closed;
                
                // Определяем outcome из CLOB market tokens
                if (clob.tokens) {
                    const token = clob.tokens.find((t: MarketToken) => t.token_id === tokenId);
                    if (token) {
                        position.outcome = token.outcome as 'Yes' | 'No';
                    }
                }
                
                // Если не нашли в CLOB, определяем по positionType
                if (!position.outcome) {
                    // Пробуем найти через Gamma clobTokenIds
                    if (gamma.clobTokenIds && gamma.clobTokenIds.length >= 2) {
                        const tokenIndex = gamma.clobTokenIds.indexOf(tokenId);
                        if (tokenIndex >= 0 && gamma.outcomes.length > tokenIndex) {
                            position.outcome = gamma.outcomes[tokenIndex] === 'Yes' ? 'Yes' : 'No';
                        } else {
                            // Если токен не найден, используем логику из позиции
                            position.outcome = this.determineOutcomeFromPosition(position);
                        }
                    } else {
                        // Если нет информации о токенах, используем логику из позиции
                        position.outcome = this.determineOutcomeFromPosition(position);
                    }
                }
                
                // Собираем conditionId для батч-запроса разрешений
                if (gamma.conditionId) {
                    conditionIdsToResolve.add(gamma.conditionId);
                }
                
                // Собираем tokenId для батч-запроса цен (только для неразрешенных)
                if (!position.isResolved) {
                    tokenIdsForPrice.add(tokenId);
                }
            }
            
            enriched.push(position);
        }
        
        // БАТЧ-ЗАПРОС 1: Получаем все разрешения параллельно
        const resolutionPromises = Array.from(conditionIdsToResolve).map(async (conditionId) => {
            try {
                const resolution = await this.gammaAdapter.getMarketResolution(conditionId);
                return { conditionId, resolution };
            } catch {
                return { conditionId, resolution: null };
            }
        });
        const resolutions = await Promise.all(resolutionPromises);
        const resolutionMap = new Map(
            resolutions.map(r => [r.conditionId, r.resolution])
        );
        
        // БАТЧ-ЗАПРОС 2: Получаем все цены параллельно
        const pricePromises = Array.from(tokenIdsForPrice).map(async (tokenId) => {
            try {
                const midpoint = await this.clobClient.getMidpoint(tokenId);
                return { tokenId, price: parseFloat(midpoint) };
            } catch {
                return { tokenId, price: null };
            }
        });
        const prices = await Promise.all(pricePromises);
        const priceMap = new Map(
            prices.map(p => [p.tokenId, p.price])
        );
        
        // Применяем результаты батч-запросов к позициям
        for (const position of enriched) {
            if (!position.conditionId) continue;
            
            // Применяем разрешение
            const resolution = resolutionMap.get(position.conditionId);
            if (resolution) {
                position.winner = resolution.winner;
                position.isResolved = resolution.resolved;
            }
            
            // Определяем результат
            position.result = this.determineResult(position);
            
            // Рассчитываем P&L
            const pnlData = this.calculatePnL(position, resolutionMap.get(position.conditionId), priceMap.get(position.tokenId));
            if (pnlData) {
                position.pnl = pnlData.pnl;
                position.pnlPercent = pnlData.pnlPercent;
                position.currentPrice = pnlData.currentPrice;
            }
            
            if (position.conditionId) {
                position.marketUrl = `https://polymarket.com/event/${position.conditionId}`;
            }
        }
        
        return enriched;
    }

    /**
     * Рассчитать P&L для позиции (вынесено для устранения дублирования)
     */
    private calculatePnL(
        position: PositionInfo,
        resolution: { winner?: 'Yes' | 'No'; resolved: boolean } | null | undefined,
        currentPrice: number | null | undefined
    ): { pnl: number; pnlPercent: number; currentPrice: number } | null {
        const isResolved = resolution?.resolved ?? position.isResolved;
        const winner = resolution?.winner ?? position.winner;
        
        if (isResolved && winner) {
            // Для разрешенных рынков: финальный P&L на основе результата
            const finalPrice = position.result === 'win' ? 1.0 : 0.0;
            
            let pnl: number;
            let pnlPercent: number;
            
            if (position.positionType === 'LONG') {
                pnl = (finalPrice - position.avgPrice) * position.size;
                pnlPercent = position.avgPrice > 0
                    ? ((finalPrice - position.avgPrice) / position.avgPrice) * 100
                    : 0;
            } else {
                // SHORT: выигрываем если цена упала до 0
                pnl = (position.avgPrice - finalPrice) * position.size;
                pnlPercent = position.avgPrice > 0
                    ? ((position.avgPrice - finalPrice) / position.avgPrice) * 100
                    : 0;
            }
            
            return { pnl, pnlPercent, currentPrice: finalPrice };
        } else if (currentPrice !== null && currentPrice !== undefined) {
            // Для неразрешенных рынков: используем текущую цену
            if (position.size > 0) {
                let pnl: number;
                let pnlPercent: number;
                
                if (position.positionType === 'LONG') {
                    // LONG: выигрываем если цена выросла
                    pnl = (currentPrice - position.avgPrice) * position.size;
                    pnlPercent = position.avgPrice > 0
                        ? ((currentPrice - position.avgPrice) / position.avgPrice) * 100
                        : 0;
                } else {
                    // SHORT: выигрываем если цена упала
                    pnl = (position.avgPrice - currentPrice) * position.size;
                    pnlPercent = position.avgPrice > 0
                        ? ((position.avgPrice - currentPrice) / position.avgPrice) * 100
                        : 0;
                }
                
                return { pnl, pnlPercent, currentPrice };
            }
        }
        
        return null;
    }

    /**
     * Определить результат позиции (win/loss/pending)
     */
    private determineResult(position: PositionInfo): 'win' | 'loss' | 'pending' | 'unknown' {
        if (!position.isResolved || !position.winner) {
            return 'pending';
        }
        
        // Для SHORT позиции: выигрываем если исход, против которого ставили, НЕ выиграл
        if (position.positionType === 'SHORT') {
            // SHORT означает продажу токена, т.е. ставку против этого исхода
            return position.winner !== position.outcome ? 'win' : 'loss';
        }
        
        // Для LONG позиции: выигрываем если исход, за который ставили, выиграл
        if (position.positionType === 'LONG') {
            return position.winner === position.outcome ? 'win' : 'loss';
        }
        
        return 'unknown';
    }

    /**
     * Извлечь уникальные рынки из позиций
     * Оптимизировано: батч-запросы для разрешений рынков
     */
    private async extractUniqueMarkets(
        positions: PositionInfo[],
        marketsMap: Map<string, { gamma: GammaMarket; clob: Market }>
    ): Promise<MarketInfo[]> {
        const uniqueMarkets = new Map<string, MarketInfo>();
        const conditionIdsToResolve = new Set<string>();

        // Собираем все уникальные conditionId
        for (const position of positions) {
            if (position.conditionId && !uniqueMarkets.has(position.conditionId)) {
                const marketInfo = marketsMap.get(position.conditionId);
                if (marketInfo) {
                    conditionIdsToResolve.add(position.conditionId);
                }
            }
        }

        // БАТЧ-ЗАПРОС: получаем все разрешения параллельно
        const resolutionPromises = Array.from(conditionIdsToResolve).map(async (conditionId) => {
            try {
                const resolution = await this.gammaAdapter.getMarketResolution(conditionId);
                return { conditionId, resolution };
            } catch {
                return { conditionId, resolution: null };
            }
        });

        const resolutions = await Promise.all(resolutionPromises);
        const resolutionMap = new Map(
            resolutions.map(r => [r.conditionId, r.resolution])
        );

        // Заполняем uniqueMarkets
        for (const position of positions) {
            if (!position.conditionId) continue;

            if (!uniqueMarkets.has(position.conditionId)) {
                const marketInfo = marketsMap.get(position.conditionId);
                if (marketInfo) {
                    const gammaMarket = marketInfo.gamma;
                    const tokens = gammaMarket.clobTokenIds?.map((tokenId, index) => ({
                        tokenId,
                        outcome: gammaMarket.outcomes[index] || 'Unknown',
                        price: gammaMarket.outcomePrices?.[index]
                            ? parseFloat(gammaMarket.outcomePrices[index])
                            : undefined,
                        winner: gammaMarket.outcomePrices?.[index]
                            ? parseFloat(gammaMarket.outcomePrices[index]) >= 0.99
                            : undefined,
                    })) || [];

                    const resolution = resolutionMap.get(gammaMarket.conditionId);

                    uniqueMarkets.set(position.conditionId, {
                        conditionId: gammaMarket.conditionId,
                        question: gammaMarket.question,
                        category: gammaMarket.category,
                        endDate: gammaMarket.endDate,
                        active: gammaMarket.active,
                        closed: gammaMarket.closed,
                        resolved: gammaMarket.closed,
                        winner: resolution?.winner,
                        outcomes: gammaMarket.outcomes,
                        tokens,
                        marketUrl: `https://polymarket.com/event/${gammaMarket.conditionId}`,
                    });
                }
            }
        }

        return Array.from(uniqueMarkets.values());
    }

    /**
     * Рассчитать сводную статистику
     */
    public calculateSummary(positions: PositionInfo[]): {
        totalPositions: number;
        winningPositions: number;
        losingPositions: number;
        pendingPositions: number;
        totalPnL: number;
        totalPnLPercent: number;
        longPositions: number;
        shortPositions: number;
        resolvedPnL: number;
        unrealizedPnL: number;
    } {
        let winningPositions = 0;
        let losingPositions = 0;
        let pendingPositions = 0;
        let totalPnL = 0;
        let totalPnLPercent = 0;
        let longPositions = 0;
        let shortPositions = 0;
        let resolvedPnL = 0;
        let unrealizedPnL = 0;

        for (const pos of positions) {
            if (pos.result === 'win') {
                winningPositions++;
            } else if (pos.result === 'loss') {
                losingPositions++;
            } else {
                pendingPositions++;
            }

            if (pos.positionType === 'LONG') {
                longPositions++;
            } else {
                shortPositions++;
            }

            if (pos.pnl !== undefined) {
                totalPnL += pos.pnl;
                if (pos.isResolved) {
                    resolvedPnL += pos.pnl;
                } else {
                    unrealizedPnL += pos.pnl;
                }
            }
        }

        // Рассчитываем средний P&L процент
        const positionsWithPnL = positions.filter(p => p.pnlPercent !== undefined);
        if (positionsWithPnL.length > 0) {
            totalPnLPercent = positionsWithPnL.reduce((sum, p) =>
                sum + (p.pnlPercent || 0), 0
            ) / positionsWithPnL.length;
        }

        return {
            totalPositions: positions.length,
            winningPositions,
            losingPositions,
            pendingPositions,
            totalPnL,
            totalPnLPercent,
            longPositions,
            shortPositions,
            resolvedPnL,
            unrealizedPnL,
        };
    }
}
