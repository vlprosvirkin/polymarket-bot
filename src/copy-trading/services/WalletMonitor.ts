/**
 * Основной монитор кошельков
 * Запускается каждые 5 минут через cron
 */

import { CopySignal } from '../types';
import { TradesFetcher } from './TradesFetcher';
import { SignalEmitter } from './SignalEmitter';
import { DecisionEngine } from '../scoring/DecisionEngine';
import { WalletStore } from '../storage/WalletStore';
import { ProcessedTradesCache } from '../storage/ProcessedTradesCache';
import { COPY_TRADING_CONFIG } from '../config';

export class WalletMonitor {
    private tradesFetcher: TradesFetcher;
    private decisionEngine: DecisionEngine;
    private signalEmitter: SignalEmitter;
    private walletStore: WalletStore;
    private processedCache: ProcessedTradesCache;

    constructor() {
        this.tradesFetcher = new TradesFetcher();
        this.decisionEngine = new DecisionEngine();
        this.signalEmitter = new SignalEmitter();
        this.walletStore = new WalletStore();
        this.processedCache = new ProcessedTradesCache();
    }

    /**
     * Основной метод — проверить все кошельки
     */
    async checkAllWallets(): Promise<CopySignal[]> {
        const allSignals: CopySignal[] = [];
        const wallets = this.walletStore.getActiveWallets();

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`🔍 Copy Trading Monitor`);
        console.log(`⏰ ${new Date().toLocaleString()}`);
        console.log(`📊 Checking ${wallets.length} wallets`);
        console.log(`${'═'.repeat(60)}`);

        if (wallets.length === 0) {
            console.log('\n⚠️  No wallets to monitor. Add wallets using:');
            console.log('   npm run add-wallet <address> [name]');
            return allSignals;
        }

        const windowMs = COPY_TRADING_CONFIG.tradeWindowMinutes * 60 * 1000;

        for (const wallet of wallets) {
            try {
                console.log(`\n📊 ${wallet.name || wallet.address.slice(0, 12) + '...'}`);

                // 1. Получаем последние сделки
                const trades = await this.tradesFetcher.getRecentTrades(
                    wallet.address,
                    windowMs
                );

                if (trades.length === 0) {
                    console.log('   No trades in last 10 min');
                    continue;
                }

                console.log(`   Found ${trades.length} trades`);

                // 2. Фильтруем уже обработанные
                const newTrades = trades.filter(
                    t => !this.processedCache.isProcessed(t.id)
                );

                if (newTrades.length === 0) {
                    console.log('   All trades already processed');
                    continue;
                }

                console.log(`   New trades: ${newTrades.length}`);

                // 3. Обрабатываем каждую новую сделку
                for (const trade of newTrades) {
                    // Оценка сделки
                    const signal = this.decisionEngine.evaluate(trade, wallet);

                    // Выводим и сохраняем сигнал
                    await this.signalEmitter.emit(signal);
                    allSignals.push(signal);

                    // Помечаем как обработанную
                    this.processedCache.markProcessed(trade.id);
                }

            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`   ❌ Error: ${message}`);
            }
        }

        // Обновляем lastCheckedAt
        this.walletStore.updateLastChecked(wallets.map(w => w.address));

        // Итог
        const followSignals = allSignals.filter(s => s.action === 'FOLLOW');
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`✅ Check complete`);
        console.log(`   Total signals: ${allSignals.length}`);
        console.log(`   FOLLOW signals: ${followSignals.length}`);
        console.log(`${'═'.repeat(60)}\n`);

        return allSignals;
    }
}
