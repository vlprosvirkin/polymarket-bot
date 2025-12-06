/**
 * Скрипт для поиска топ кошельков на Polymarket
 *
 * Использование:
 *   npm run discover-wallets [options]
 *
 * Примеры:
 *   npm run discover-wallets
 *   npm run discover-wallets -- --limit 20 --sort-by profit
 *   npm run discover-wallets -- --min-volume 10000
 */

import { WalletDiscovery, DiscoveryOptions } from '../services/WalletDiscovery';
import { WalletStore } from '../storage/WalletStore';

async function main() {
    const args = process.argv.slice(2);

    // Парсинг аргументов
    const options: DiscoveryOptions = {};
    let autoAdd = false;
    let minVolume = 0;
    let minProfit = 0;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const nextArg = args[i + 1];
        
        if (arg === '--limit' && nextArg) {
            options.limit = parseInt(nextArg, 10);
            i++;
        } else if (arg === '--sort-by' && nextArg) {
            if (nextArg === 'volume' || nextArg === 'profit') {
                options.sortBy = nextArg;
            }
            i++;
        } else if (arg === '--min-volume' && nextArg) {
            minVolume = parseFloat(nextArg);
            options.minVolume = minVolume;
            i++;
        } else if (arg === '--min-profit' && nextArg) {
            minProfit = parseFloat(nextArg);
            options.minProfit = minProfit;
            i++;
        } else if (arg === '--auto-add') {
            autoAdd = true;
        } else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        }
    }

    const discovery = new WalletDiscovery();
    const walletStore = new WalletStore();

    try {
        console.log(`
╔════════════════════════════════════════════════════════════════╗
║              POLYMARKET WALLET DISCOVERY                       ║
╚════════════════════════════════════════════════════════════════╝
`);

        // Запускаем discovery
        const result = await discovery.discoverTopWallets(options);

        if (result.wallets.length === 0) {
            console.log('⚠️  No wallets found. Try adjusting filters.');
            process.exit(0);
        }

        // Выводим результаты
        console.log(`\n📊 DISCOVERY RESULTS\n`);
        console.log(`${'═'.repeat(70)}`);
        console.log(`Source: ${result.source}`);
        console.log(`Found: ${result.totalFound} wallets`);
        console.log(`Showing: ${result.wallets.length} wallets`);
        console.log(`Fetched at: ${result.fetchedAt.toLocaleString()}`);
        console.log(`${'═'.repeat(70)}\n`);

        // Проверяем существующие кошельки
        const existingWallets = walletStore.getAllWallets();
        const existingAddresses = new Set(
            existingWallets.map(w => w.address.toLowerCase())
        );

        // Выводим таблицу
        console.log('Rank | Address                          | Volume      | Trades | ROI     | Status');
        console.log('─'.repeat(70));

        for (let i = 0; i < result.wallets.length; i++) {
            const wallet = result.wallets[i];
            if (!wallet) continue;
            
            const rank = (i + 1).toString().padStart(4);
            const address = wallet.address.slice(0, 34).padEnd(34);
            const volume = `$${wallet.stats.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}`.padEnd(12);
            const trades = wallet.stats.totalTrades.toString().padStart(6);
            const roi = `${(wallet.stats.roi * 100).toFixed(1)}%`.padEnd(8);
            const status = existingAddresses.has(wallet.address.toLowerCase()) 
                ? '✅ Exists' 
                : '🆕 New';

            console.log(`${rank} | ${address} | ${volume} | ${trades} | ${roi} | ${status}`);
        }

        // Статистика
        const newWallets = result.wallets.filter(
            w => !existingAddresses.has(w.address.toLowerCase())
        );

        console.log(`\n📈 SUMMARY`);
        console.log(`   Total found: ${result.wallets.length}`);
        console.log(`   New wallets: ${newWallets.length}`);
        console.log(`   Already in watchlist: ${result.wallets.length - newWallets.length}`);

        if (newWallets.length > 0) {
            const avgVolume = newWallets.reduce((sum, w) => sum + w.stats.totalVolume, 0) / newWallets.length;
            const avgTrades = newWallets.reduce((sum, w) => sum + w.stats.totalTrades, 0) / newWallets.length;
            
            console.log(`\n   Average volume: $${avgVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
            console.log(`   Average trades: ${avgTrades.toFixed(0)}`);
        }

        // Автоматическое добавление
        if (autoAdd && newWallets.length > 0) {
            console.log(`\n🔄 Auto-adding ${newWallets.length} new wallets...`);
            
            for (const wallet of newWallets) {
                try {
                    await walletStore.addWalletAsync(
                        wallet.address,
                        wallet.displayName || `Discovered ${wallet.address.slice(0, 8)}`
                    );
                    console.log(`   ✅ Added: ${wallet.address.slice(0, 12)}...`);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    console.log(`   ⚠️  Skipped ${wallet.address.slice(0, 12)}...: ${message}`);
                }
            }

            console.log(`\n✅ Discovery complete! ${newWallets.length} wallets added.`);
        } else if (newWallets.length > 0) {
            console.log(`\n💡 Tip: Use --auto-add to automatically add new wallets to watchlist`);
            console.log(`   Example: npm run discover-wallets -- --auto-add --limit 10`);
        }

        process.exit(0);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\n❌ Discovery failed: ${message}`);
        process.exit(1);
    }
}

function printHelp() {
    console.log(`
Usage: npm run discover-wallets [options]

Options:
  --limit <number>        Number of wallets to discover (default: 50)
  --sort-by <type>        Sort by 'volume' or 'profit' (default: 'profit')
  --min-volume <amount>    Minimum volume in USDC (default: 0)
  --min-profit <amount>   Minimum profit in USDC (default: 0)
  --auto-add              Automatically add new wallets to watchlist
  --help, -h              Show this help message

Examples:
  npm run discover-wallets
  npm run discover-wallets -- --limit 20 --sort-by profit
  npm run discover-wallets -- --min-volume 10000 --auto-add
  npm run discover-wallets -- --sort-by volume --limit 30
`);
}

void main();

