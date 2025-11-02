/**
 * Endgame Sweep Strategy с хеджированием хвост-риска
 *
 * Арбитраж на разрешении событий:
 * - Находит рынки с YES 95-99% (почти гарантированный исход)
 * - Основная позиция: большой объем в YES
 * - Хедж: небольшой объем в NO (страховка от черного лебедя)
 * - Цель: закрыть гэп с защитой от катастрофических потерь
 */

import {
    Market,
    OrderSide,
    IStrategy,
    StrategyConfig,
    TradeSignal,
    Position
} from '../types';

// Константы стратегии
export const DEFAULT_ORDER_SIZE = 10; // $10 на сделку (по умолчанию)

export interface EndgameConfig extends StrategyConfig {
    maxAcceptableLoss: number; // % от капитала (0.2 = 20%)
    minProbability: number;    // Минимальная вероятность (0.95 = 95%)
    maxProbability: number;    // Максимальная вероятность (0.99 = 99%)
    maxDaysToResolution: number; // Макс дней до разрешения (7-14)
    earlyExitThreshold: number;  // Порог раннего выхода (0.99 = 99%)
}

export class EndgameStrategy implements IStrategy {
    name = "Endgame Sweep with Tail-Risk Hedge";
    config: EndgameConfig;

    constructor(config: EndgameConfig) {
        this.config = config;
    }

    /**
     * Фильтрация: только рынки в "эндгейме" (95-99%) близкие к разрешению
     */
    filterMarkets(markets: Market[]): Market[] {
        const now = new Date();

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

            // Исключить NegRisk
            if (this.config.excludeNegRisk && market.neg_risk) {
                return false;
            }

            // Проверка даты разрешения
            if (!market.end_date_iso) {
                return false; // Нужна четкая дата
            }

            const endDate = new Date(market.end_date_iso);
            const daysUntilEnd = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

            // Должно разрешиться в ближайшие N дней
            if (daysUntilEnd > this.config.maxDaysToResolution || daysUntilEnd < 0) {
                return false;
            }

            // ГЛАВНЫЙ ФИЛЬТР: вероятность в диапазоне 95-99%
            const yesToken = market.tokens.find(t => t.outcome === "Yes");
            if (!yesToken) return false;

            const yesPrice = yesToken.price;

            if (yesPrice < this.config.minProbability || yesPrice > this.config.maxProbability) {
                return false;
            }

            return true;
        }).slice(0, this.config.maxMarkets);
    }

    /**
     * Генерация сигналов с расчетом хеджа
     */
    generateSignals(market: Market, currentPrice: number, position?: Position): TradeSignal[] {
        const signals: TradeSignal[] = [];

        const yesToken = market.tokens.find(t => t.outcome === "Yes");
        const noToken = market.tokens.find(t => t.outcome === "No");

        if (!yesToken || !noToken) return signals;

        // Не открываем новые позиции если уже есть
        if (position && position.size > 0) {
            return signals;
        }

        // Проверяем что цена в диапазоне эндгейма
        if (currentPrice < this.config.minProbability || currentPrice > this.config.maxProbability) {
            return signals;
        }

        // Расчет размеров позиций с хеджем
        const hedge = this.calculateHedgePosition(
            this.config.orderSize,
            currentPrice,
            this.config.maxAcceptableLoss
        );

        // Основная позиция в YES (90% капитала)
        const yesSize = hedge.mainPositionSize;
        if (yesSize >= market.minimum_order_size) {
            signals.push({
                market,
                tokenId: yesToken.token_id,
                side: OrderSide.BUY,
                price: currentPrice,
                size: yesSize,
                reason: `Endgame YES @ ${(currentPrice * 100).toFixed(2)}% (${hedge.yesCost.toFixed(2)} USDC)`
            });
        }

        // Хедж в NO (страховка от черного лебедя)
        const noPrice = 1 - currentPrice;
        const noSize = hedge.hedgePositionSize;
        if (noSize >= market.minimum_order_size) {
            signals.push({
                market,
                tokenId: noToken.token_id,
                side: OrderSide.BUY,
                price: noPrice,
                size: noSize,
                reason: `Hedge NO @ ${(noPrice * 100).toFixed(2)}% (${hedge.noCost.toFixed(2)} USDC insurance)`
            });
        }

        return signals;
    }

    /**
     * Расчет хеджирующей позиции
     */
    calculateHedgePosition(totalCapital: number, yesPrice: number, maxLossPct: number): {
        mainPositionSize: number;
        hedgePositionSize: number;
        yesCost: number;
        noCost: number;
        maxLoss: number;
        netProfitIfWin: number;
        netLossIfLose: number;
    } {
        const noPrice = 1 - yesPrice;

        // Размер основной позиции (используем весь капитал)
        const yesSize = Math.floor(totalCapital / yesPrice);
        const yesCost = yesSize * yesPrice;

        // Расчет максимального приемлемого убытка (MAL)
        const maxLoss = yesCost * maxLossPct;

        // Сколько должен принести хедж для ограничения убытка до MAL
        const hedgePayoutNeeded = yesCost - maxLoss;

        // Прибыль на одну акцию NO если сработает
        const noProfitPerShare = 1 - noPrice;

        // Необходимое количество акций NO
        const noSize = Math.ceil(hedgePayoutNeeded / noProfitPerShare);
        const noCost = noSize * noPrice;

        // Расчет финальных результатов
        const netProfitIfWin = (yesSize * (1 - yesPrice)) - noCost;
        const netLossIfLose = -yesCost + (noSize * (1 - noPrice));

        return {
            mainPositionSize: yesSize,
            hedgePositionSize: noSize,
            yesCost,
            noCost,
            maxLoss,
            netProfitIfWin,
            netLossIfLose
        };
    }

    /**
     * Проверка раннего выхода
     */
    shouldClosePosition(market: Market, position: Position, currentPrice: number): boolean {
        // Ранний выход если цена достигла порога (например 99%)
        if (currentPrice >= this.config.earlyExitThreshold) {
            return true;
        }

        // Ранний выход если до разрешения < 1 дня
        if (market.end_date_iso) {
            const endDate = new Date(market.end_date_iso);
            const now = new Date();
            const hoursUntilEnd = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60);
            if (hoursUntilEnd < 24) {
                return true;
            }
        }

        // Stop loss: если цена упала ниже порога эндгейма
        if (currentPrice < this.config.minProbability) {
            return true;
        }

        return false;
    }

    /**
     * Расчет P&L с учетом хеджа
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
        if (signal.price < 0.01 || signal.price > 0.99) {
            return false;
        }

        if (signal.size < signal.market.minimum_order_size) {
            return false;
        }

        if (signal.side !== OrderSide.BUY) {
            return false;
        }

        return true;
    }

    /**
     * Описание стратегии
     */
    getDescription(): string {
        const daysToEnd = this.config.maxDaysToResolution;
        const minProb = (this.config.minProbability * 100).toFixed(0);
        const maxProb = (this.config.maxProbability * 100).toFixed(0);
        const mal = (this.config.maxAcceptableLoss * 100).toFixed(0);

        return `
Endgame Sweep Strategy с хеджированием:

📊 Фильтры:
   - Вероятность YES: ${minProb}% - ${maxProb}%
   - До разрешения: < ${daysToEnd} дней
   - Объем: мин $${this.config.minVolume}
   - Макс рынков: ${this.config.maxMarkets}

💰 Управление капиталом:
   - Основная позиция: ~${this.config.orderSize} USDC в YES
   - Хедж: автоматический расчет для ограничения убытка до ${mal}%
   - Стоимость страховки: ~2-5% от капитала

🎯 Логика выхода:
   - Ранний выход при достижении ${(this.config.earlyExitThreshold * 100).toFixed(0)}%
   - Ранний выход за 24 часа до разрешения
   - Stop loss если цена упала ниже ${minProb}%
   - Автоматическое разрешение рынка

📈 Ожидаемые результаты (на примере YES @ 97%):
   - Сценарий успеха (97% вероятность): +2-3% ROI
   - Сценарий неудачи (3% вероятность): -${mal}% (защищено хеджем)
   - Годовая доходность: зависит от частоты возможностей
        `.trim().replace(/\$\{totalCapital\}/g, this.config.orderSize.toString());
    }

    /**
     * Анализ сделки перед входом
     */
    analyzeTradeSetup(market: Market, yesPrice: number): {
        valid: boolean;
        analysis: string;
        hedge: {
            mainPositionSize: number;
            hedgePositionSize: number;
            yesCost: number;
            noCost: number;
            maxLoss: number;
            netProfitIfWin: number;
            netLossIfLose: number;
        };
    } {
        const hedge = this.calculateHedgePosition(
            this.config.orderSize,
            yesPrice,
            this.config.maxAcceptableLoss
        );

        const noPrice = 1 - yesPrice;
        const totalCost = hedge.yesCost + hedge.noCost;
        const insurancePct = (hedge.noCost / totalCost) * 100;

        let valid = true;
        let warnings: string[] = [];

        // Проверки
        if (hedge.noCost > totalCost * 0.10) {
            warnings.push(`⚠️  Страховка дорогая: ${insurancePct.toFixed(1)}%`);
        }

        if (hedge.netProfitIfWin < 0) {
            warnings.push(`❌ Ожидаемая прибыль отрицательная!`);
            valid = false;
        }

        if (noPrice > 0.10) {
            warnings.push(`⚠️  Высокий риск: NO @ ${(noPrice * 100).toFixed(1)}%`);
        }

        const analysis = `
📊 Анализ сделки: ${market.question}

💰 Затраты:
   YES: ${hedge.mainPositionSize} @ ${(yesPrice * 100).toFixed(2)}% = ${hedge.yesCost.toFixed(2)} USDC
   NO:  ${hedge.hedgePositionSize} @ ${(noPrice * 100).toFixed(2)}% = ${hedge.noCost.toFixed(2)} USDC (страховка)
   Всего: ${totalCost.toFixed(2)} USDC (${insurancePct.toFixed(1)}% на страховку)

📈 Сценарии:
   ✅ Успех (YES выигрывает):
      Прибыль: +${hedge.netProfitIfWin.toFixed(2)} USDC
      ROI: +${((hedge.netProfitIfWin / totalCost) * 100).toFixed(2)}%

   ❌ Неудача (NO выигрывает):
      Убыток: ${hedge.netLossIfLose.toFixed(2)} USDC
      ROI: ${((hedge.netLossIfLose / totalCost) * 100).toFixed(2)}%
      Защищено хеджем до ${(this.config.maxAcceptableLoss * 100).toFixed(0)}%

${warnings.length > 0 ? '\n⚠️  Предупреждения:\n   ' + warnings.join('\n   ') : ''}
        `.trim();

        return { valid, analysis, hedge };
    }
}
