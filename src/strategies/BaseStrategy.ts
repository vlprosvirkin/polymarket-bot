/**
 * Базовая стратегия маркет-мейкинга с автоматическим закрытием позиций
 */

import {
    Market,
    OrderSide,
    IStrategy,
    StrategyConfig,
    TradeSignal,
    Position
} from '../types';

export class BaseStrategy implements IStrategy {
    name = "Base Market Making Strategy";
    config: StrategyConfig;

    constructor(config: StrategyConfig) {
        this.config = config;
    }

    /**
     * Фильтрация рынков по критериям стратегии
     */
    filterMarkets(markets: Market[]): Market[] {
        return markets.filter(market => {
            // Только активные рынки
            if (!market.active || market.closed || !market.accepting_orders) {
                return false;
            }

            // Должны быть токены
            if (!market.tokens || market.tokens.length === 0) {
                return false;
            }

            // Минимальный объем
            const volume = parseFloat(market.volume || "0");
            if (volume < this.config.minVolume) {
                return false;
            }

            // Исключить NegRisk если настроено
            if (this.config.excludeNegRisk && market.neg_risk) {
                return false;
            }

            // Фильтр по цене токена
            const yesToken = market.tokens[0];
            const price = yesToken.price;

            if (this.config.minPrice && price < this.config.minPrice) {
                return false;
            }

            if (this.config.maxPrice && price > this.config.maxPrice) {
                return false;
            }

            return true;
        }).slice(0, this.config.maxMarkets);
    }

    /**
     * Генерация торговых сигналов для маркет-мейкинга
     */
    generateSignals(market: Market, currentPrice: number, position?: Position): TradeSignal[] {
        const signals: TradeSignal[] = [];
        const yesToken = market.tokens[0];
        const currentPosition = position?.size || 0;

        // Рассчитываем bid/ask цены с учетом spread
        const halfSpread = this.config.spread / 2;
        const bidPrice = Math.max(0.01, currentPrice - halfSpread);
        const askPrice = Math.min(0.99, currentPrice + halfSpread);

        // BID сигнал: покупаем если позиция не максимальная
        if (currentPosition < this.config.maxPosition) {
            signals.push({
                market,
                tokenId: yesToken.token_id,
                side: OrderSide.BUY,
                price: bidPrice,
                size: this.config.orderSize,
                reason: `Market making BID @ ${(bidPrice * 100).toFixed(2)}%`
            });
        }

        // ASK сигнал: продаем если есть позиция
        if (currentPosition > 0) {
            signals.push({
                market,
                tokenId: yesToken.token_id,
                side: OrderSide.SELL,
                price: askPrice,
                size: Math.min(this.config.orderSize, currentPosition),
                reason: `Market making ASK @ ${(askPrice * 100).toFixed(2)}%`
            });
        }

        return signals;
    }

    /**
     * Проверка нужно ли закрыть позицию
     */
    shouldClosePosition(market: Market, position: Position, currentPrice: number): boolean {
        // Закрываем если цена выше порога прибыли
        if (currentPrice >= this.config.profitThreshold) {
            return true;
        }

        // Stop loss (если настроен)
        if (this.config.stopLoss && currentPrice <= this.config.stopLoss) {
            return true;
        }

        // Закрываем если рынок скоро закроется (менее 1 часа)
        if (market.end_date_iso) {
            const endDate = new Date(market.end_date_iso);
            const now = new Date();
            const hoursUntilEnd = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60);
            if (hoursUntilEnd < 1) {
                return true;
            }
        }

        return false;
    }

    /**
     * Расчет P&L для позиции
     */
    calculatePnL(position: Position, currentPrice: number): number {
        const costBasis = position.size * position.averagePrice;
        const currentValue = position.size * currentPrice;
        return currentValue - costBasis;
    }

    /**
     * Валидация сигнала перед отправкой
     */
    validateSignal(signal: TradeSignal): boolean {
        // Проверка цены
        if (signal.price < 0.01 || signal.price > 0.99) {
            return false;
        }

        // Проверка размера
        if (signal.size < signal.market.minimum_order_size) {
            return false;
        }

        return true;
    }
}
