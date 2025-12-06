/**
 * Copy Trading - Entry Point
 *
 * Запуск: npm run check-wallets
 * Или через cron: каждые 5 минут - cd /path/to/bot && npm run check-wallets
 */

import { WalletMonitor } from './services/WalletMonitor';

async function main() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    COPY TRADING MONITOR                        ║
║         Отслеживание сделок успешных трейдеров                 ║
╚════════════════════════════════════════════════════════════════╝
`);

    const monitor = new WalletMonitor();

    try {
        const signals = await monitor.checkAllWallets();

        // Выводим summary для FOLLOW сигналов
        const followSignals = signals.filter(s => s.action === 'FOLLOW');

        if (followSignals.length > 0) {
            console.log('📨 FOLLOW Signals Summary:');
            console.log('─'.repeat(60));
            for (const sig of followSignals) {
                console.log(`   ${sig.walletName || sig.wallet.slice(0, 10)}...`);
                console.log(`   → ${sig.trade.side} ${sig.trade.outcome} @ ${(sig.trade.price * 100).toFixed(1)}%`);
                console.log(`   → Suggested: $${sig.suggestedSize?.toFixed(2)}`);
                console.log('');
            }
        }

        process.exit(0);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('❌ Monitor failed:', message);
        process.exit(1);
    }
}

// Запуск
void main();
