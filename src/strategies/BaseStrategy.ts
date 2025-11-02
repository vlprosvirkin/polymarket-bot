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
import { getYesToken } from '../utils/market-utils';
import { calculatePnL as calculatePnLUtil, formatPrice } from '../utils/price-utils';
import { MarketFilter } from '../services/MarketFilter';

export class BaseStrategy implements IStrategy {
    name = "Base Market Making Strategy";
    config: StrategyConfig;

    constructor(config: StrategyConfig) {
        this.config = config;
    }

    /**
     * Фильтрация рынков по критериям стратегии
     * Использует MarketFilter для базовой фильтрации (устраняет дублирование)
     */
    filterMarkets(markets: Market[]): Market[] {
        // Базовая фильтрация через MarketFilter
        let filtered = MarketFilter.filterWithConfig(markets, {
            minPrice: this.config.minPrice,
            maxPrice: this.config.maxPrice,
            excludeNegRisk: this.config.excludeNegRisk
        });

        // Ограничиваем количество рынков
        return filtered.slice(0, this.config.maxMarkets);
    }

    /**
     * Генерация торговых сигналов для маркет-мейкинга
     */
    generateSignals(market: Market, currentPrice: number, position?: Position): TradeSignal[] {
        const signals: TradeSignal[] = [];
        const yesToken = getYesToken(market);
        if (!yesToken) return signals;
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
                reason: `Market making BID @ ${formatPrice(bidPrice)}`
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
                reason: `Market making ASK @ ${formatPrice(askPrice)}`
            });
        }

        return signals;
    }

    /**
     * Проверка нужно ли закрыть позицию
     */
    shouldClosePosition(market: Market, _position: Position, currentPrice: number): boolean {
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
        return calculatePnLUtil(position.size, position.averagePrice, currentPrice);
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
