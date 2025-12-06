/**
 * Показать список отслеживаемых кошельков
 *
 * Использование:
 *   npm run list-wallets
 */

import { WalletStore } from '../storage/WalletStore';

function main() {
    const walletStore = new WalletStore();
    const wallets = walletStore.getAllWallets();

    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    WATCHED WALLETS                             ║
╚════════════════════════════════════════════════════════════════╝
`);

    if (wallets.length === 0) {
        console.log('No wallets found.');
        console.log('\nAdd wallets using:');
        console.log('  npm run add-wallet <address> [name]');
        return;
    }

    console.log(`Total: ${wallets.length} wallets\n`);

    for (const wallet of wallets) {
        const statusEmoji = wallet.status === 'active' ? '🟢' : '⏸️';
        const name = wallet.name || 'Unnamed';

        console.log(`${statusEmoji} ${name}`);
        console.log(`   Address: ${wallet.address}`);
        console.log(`   Status: ${wallet.status}`);
        console.log(`   Added: ${new Date(wallet.addedAt).toLocaleString()}`);

        if (wallet.lastCheckedAt) {
            console.log(`   Last checked: ${new Date(wallet.lastCheckedAt).toLocaleString()}`);
        }

        if (wallet.stats) {
            console.log(`   Stats:`);
            console.log(`      ROI: ${(wallet.stats.roi * 100).toFixed(1)}%`);
            console.log(`      Win Rate: ${(wallet.stats.winRate * 100).toFixed(1)}%`);
            console.log(`      Volume: $${wallet.stats.totalVolume.toLocaleString()}`);
            console.log(`      Trades: ${wallet.stats.totalTrades}`);
        }

        console.log('');
    }
}

main();
