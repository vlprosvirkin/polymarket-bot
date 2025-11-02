/**
 * Типы для торговых стратегий
 */

import { Market, OrderSide } from './market';

/**
 * Конфигурация стратегии
 */
export interface StrategyConfig {
    // Маркет-мейкинг
    spread: number; // Spread между bid/ask (0.02 = 2%)
    orderSize: number; // Размер ордера в токенах
    maxPosition: number; // Максимальная позиция по одному токену

    // Закрытие позиций
    profitThreshold: number; // Порог прибыли (0.7 = 70%)
    stopLoss?: number; // Stop loss (опционально)

    // Фильтрация рынков
    // ⚠️ minVolume удален - volume не возвращается API
    // Для проверки ликвидности используйте PolymarketDataService + MarketFilter.filterEnrichedForTrading
    maxMarkets: number; // Максимум рынков для торговли
    excludeNegRisk: boolean; // Исключить NegRisk рынки

    // Фильтры по цене
    minPrice?: number; // Минимальная цена токена (0.2 = 20%)
    maxPrice?: number; // Максимальная цена токена (0.8 = 80%)
}

/**
 * Сигнал от стратегии
 */
export interface TradeSignal {
    market: Market;
    tokenId: string;
    side: OrderSide;
    price: number;
    size: number;
    reason: string; // Причина сигнала
}

/**
 * Позиция
 */
export interface Position {
    tokenId: string;
    market: string;
    size: number; // Количество токенов
    averagePrice: number; // Средняя цена входа
    currentPrice?: number; // Текущая цена
    pnl?: number; // Profit & Loss
    timestamp: number; // Когда открыта
}

/**
 * Базовый интерфейс стратегии
 */
export interface IStrategy {
    name: string;
    config: StrategyConfig;

    /**
     * Фильтрация рынков
     */
    filterMarkets(markets: Market[]): Market[];

    /**
     * Генерация торговых сигналов
     */
    generateSignals(market: Market, currentPrice: number, position?: Position): TradeSignal[];

    /**
     * Проверка нужно ли закрыть позицию
     */
    shouldClosePosition(market: Market, position: Position, currentPrice: number): boolean;
}
