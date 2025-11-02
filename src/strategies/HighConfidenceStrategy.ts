/**
 * High Confidence Strategy
 *
 * Стратегия для рынков с высокой вероятностью (>80%)
 * - 90% капитала в YES
 * - 10% капитала в NO (хедж)
 */

import {
    Market,
    OrderSide,
    IStrategy,
    StrategyConfig,
    TradeSignal,
    Position
} from '../types';

export class HighConfidenceStrategy implements IStrategy {
    name = "High Confidence Strategy";
    config: StrategyConfig;

    constructor(config: StrategyConfig) {
        this.config = config;
    }

    /**
     * Фильтрация: только рынки с вероятностью YES >= 80%
     */
    filterMarkets(markets: Market[]): Market[] {
        return markets.filter(market => {
            // Базовые проверки
            if (!market.active || market.closed || !market.accepting_orders) {
                return false;
            }

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

            // ГЛАВНЫЙ ФИЛЬТР: вероятность YES >= 80%
            const yesToken = market.tokens.find(t => t.outcome === "Yes");
            if (!yesToken) return false;

            const yesPrice = yesToken.price;

            // Вероятность должна быть >= 80%
            if (yesPrice < 0.80) {
                return false;
            }

            return true;
        }).slice(0, this.config.maxMarkets);
    }

    /**
     * Генерация сигналов: 90% в YES, 10% в NO
     */
    generateSignals(market: Market, currentPrice: number, position?: Position): TradeSignal[] {
        const signals: TradeSignal[] = [];

        const yesToken = market.tokens.find(t => t.outcome === "Yes");
        const noToken = market.tokens.find(t => t.outcome === "No");

        if (!yesToken || !noToken) return signals;

        const currentPosition = position?.size || 0;

        // Проверяем что вероятность все еще >= 80%
        if (currentPrice < 0.80) {
            return signals; // Не генерируем сигналы если упало ниже 80%
        }

        // Если позиции нет - открываем
        if (currentPosition === 0) {
            // Рассчитываем размер позиции
            const totalSize = this.config.orderSize;
            const yesSize = Math.floor(totalSize * 0.9); // 90%
            const noSize = Math.floor(totalSize * 0.1);  // 10%

            // YES сигнал (90% капитала)
            if (yesSize >= market.minimum_order_size) {
                signals.push({
                    market,
                    tokenId: yesToken.token_id,
                    side: OrderSide.BUY,
                    price: currentPrice,
                    size: yesSize,
                    reason: `High confidence YES (${(currentPrice * 100).toFixed(1)}%) - 90% allocation`
                });
            }

            // NO сигнал (10% капитала как хедж)
            const noPrice = 1 - currentPrice; // Цена NO токена
            if (noSize >= market.minimum_order_size) {
                signals.push({
                    market,
                    tokenId: noToken.token_id,
                    side: OrderSide.BUY,
                    price: noPrice,
                    size: noSize,
                    reason: `Hedge NO (${(noPrice * 100).toFixed(1)}%) - 10% allocation`
                });
            }
        }

        return signals;
    }

    /**
     * Закрытие позиции при достижении профита или при падении вероятности
     */
    shouldClosePosition(market: Market, position: Position, currentPrice: number): boolean {
        // Закрываем если достигли порога профита
        if (currentPrice >= this.config.profitThreshold) {
            return true;
        }

        // Закрываем если вероятность упала ниже 75%
        // (мы заходили при 80%+, выходим если упало на 5%+)
        if (currentPrice < 0.75) {
            return true;
        }

        // Stop loss (если настроен)
        if (this.config.stopLoss && currentPrice <= this.config.stopLoss) {
            return true;
        }

        // Закрываем если рынок скоро закроется (менее 12 часов)
        if (market.end_date_iso) {
            const endDate = new Date(market.end_date_iso);
            const now = new Date();
            const hoursUntilEnd = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60);
            if (hoursUntilEnd < 12) {
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
     * Валидация сигнала
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

        // Проверка что это BUY сигнал (стратегия только покупает)
        if (signal.side !== OrderSide.BUY) {
            return false;
        }

        return true;
    }

    /**
     * Получить описание стратегии
     */
    getDescription(): string {
        return `
High Confidence Strategy:
- Находит рынки с вероятностью YES >= 80%
- Заход: 90% в YES, 10% в NO (хедж)
- Выход: при достижении ${(this.config.profitThreshold * 100).toFixed(0)}% или падении < 75%
- Объем рынка: мин $${this.config.minVolume}
- Макс рынков: ${this.config.maxMarkets}
        `.trim();
    }
}
