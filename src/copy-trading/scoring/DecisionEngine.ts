/**
 * Движок принятия решений: FOLLOW или IGNORE
 */

import { WalletTrade, WatchedWallet, CopySignal } from '../types';
import { COPY_TRADING_CONFIG } from '../config';

export class DecisionEngine {
    private config = COPY_TRADING_CONFIG.scoring;

    /**
     * Оценить сделку и принять решение
     */
    evaluate(trade: WalletTrade, wallet: WatchedWallet): CopySignal {
        const reasons: string[] = [];
        let shouldFollow = true;
        let confidence = 0.5; // Базовый confidence

        // Правило 1: Минимальный размер сделки
        if (trade.notional < this.config.minNotionalUsd) {
            shouldFollow = false;
            reasons.push(`Trade size $${trade.notional.toFixed(2)} < min $${this.config.minNotionalUsd}`);
        } else {
            reasons.push(`Trade size $${trade.notional.toFixed(2)} ✓`);
            confidence += 0.1;
        }

        // Правило 2: Проверяем статистику кошелька (если есть)
        if (wallet.stats) {
            // ROI
            if (wallet.stats.roi >= this.config.minWalletRoi) {
                reasons.push(`Wallet ROI ${(wallet.stats.roi * 100).toFixed(1)}% ✓`);
                confidence += 0.2;
            } else {
                reasons.push(`Wallet ROI ${(wallet.stats.roi * 100).toFixed(1)}% < min ${this.config.minWalletRoi * 100}%`);
                confidence -= 0.1;
            }

            // Win Rate
            if (wallet.stats.winRate >= this.config.minWalletWinRate) {
                reasons.push(`Wallet WinRate ${(wallet.stats.winRate * 100).toFixed(1)}% ✓`);
                confidence += 0.1;
            } else {
                reasons.push(`Wallet WinRate ${(wallet.stats.winRate * 100).toFixed(1)}% < min ${this.config.minWalletWinRate * 100}%`);
                confidence -= 0.1;
            }
        } else {
            // Нет статистики - доверяем но с меньшим confidence
            reasons.push('No wallet stats available (trusting anyway)');
        }

        // Правило 3: Только BUY сделки (продажи сложнее копировать)
        if (trade.side === 'SELL') {
            shouldFollow = false;
            reasons.push('SELL trades not supported for copying');
        }

        // Нормализуем confidence
        confidence = Math.max(0, Math.min(1, confidence));

        // Рассчитываем рекомендуемый размер
        const suggestedSize = this.calculateSuggestedSize(trade.notional);

        // Рассчитываем максимальную цену (с учетом slippage)
        const maxPrice = trade.price * (1 + COPY_TRADING_CONFIG.copy.maxSlippagePercent);

        return {
            id: `sig_${Date.now()}_${wallet.address.slice(0, 8)}`,
            wallet: wallet.address,
            walletName: wallet.name,
            trade,
            action: shouldFollow ? 'FOLLOW' : 'IGNORE',
            confidence,
            reasons,
            suggestedSize,
            maxPrice,
            createdAt: new Date(),
        };
    }

    /**
     * Рассчитать рекомендуемый размер позиции
     */
    private calculateSuggestedSize(whaleNotional: number): number {
        const { copyRatio, minTradeSize, maxTradeSize } = COPY_TRADING_CONFIG.copy;

        let size = whaleNotional * copyRatio;
        size = Math.max(size, minTradeSize);
        size = Math.min(size, maxTradeSize);

        return Math.round(size * 100) / 100; // Округляем до центов
    }
}
