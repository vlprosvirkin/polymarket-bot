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
    StrategyConfig,
    TradeSignal,
    Position
} from '../types';
import { BaseStrategy } from './BaseStrategy';
import { getYesToken, getNoToken } from '../utils/market-utils';

export class HighConfidenceStrategy extends BaseStrategy {
    name = "High Confidence Strategy";

    constructor(config: StrategyConfig) {
        super(config);
    }

    /**
     * Фильтрация: только рынки с вероятностью YES >= 80%
     */
    filterMarkets(markets: Market[]): Market[] {
        // Используем базовую фильтрацию из BaseStrategy
        const baseFiltered = super.filterMarkets(markets);

        // Добавляем специфичный фильтр: вероятность YES >= 80%
        return baseFiltered.filter(market => {
            const yesToken = getYesToken(market);
            if (!yesToken) return false;

            // Вероятность должна быть >= 80%
            return yesToken.price >= 0.80;
        });
    }

    /**
     * Генерация сигналов: 90% в YES, 10% в NO
     */
    generateSignals(market: Market, currentPrice: number, position?: Position): TradeSignal[] {
        const signals: TradeSignal[] = [];

        const yesToken = getYesToken(market);
        const noToken = getNoToken(market);

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
    shouldClosePosition(market: Market, _position: Position, currentPrice: number): boolean {
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

    // calculatePnL наследуется от BaseStrategy

    /**
     * Валидация сигнала
     */
    validateSignal(signal: TradeSignal): boolean {
        // Базовая валидация из BaseStrategy
        if (!super.validateSignal(signal)) {
            return false;
        }

        // Дополнительная проверка: стратегия только покупает
        return signal.side === OrderSide.BUY;
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
- Объем рынка: не проверяется (API не возвращает volume)
- Макс рынков: ${this.config.maxMarkets}
        `.trim();
    }
}
