/**
 * Добавить кошелек для отслеживания
 *
 * Использование:
 *   npm run add-wallet <address> [name]
 *
 * Примеры:
 *   npm run add-wallet 0x1234567890abcdef...
 *   npm run add-wallet 0x1234567890abcdef... "Whale Alpha"
 */

import { WalletStore } from '../storage/WalletStore';
import { TradesFetcher } from '../services/TradesFetcher';

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
Usage: npm run add-wallet <address> [name]

Examples:
  npm run add-wallet 0x1234567890abcdef1234567890abcdef12345678
  npm run add-wallet 0x1234567890abcdef1234567890abcdef12345678 "Whale Alpha"
`);
        process.exit(1);
    }

    const address = args[0] as string;
    const name = args[1] as string | undefined;

    // Валидация адреса
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
        console.error('❌ Invalid wallet address. Must be 0x followed by 40 hex characters.');
        process.exit(1);
    }

    const walletStore = new WalletStore();
    const tradesFetcher = new TradesFetcher();

    try {
        // Проверяем что кошелек существует (получаем его сделки)
        console.log(`🔍 Checking wallet ${address}...`);
        const trades = await tradesFetcher.getAllTrades(address, 10);

        if (trades.length === 0) {
            console.log('⚠️  No trades found for this wallet. Adding anyway...');
        } else {
            console.log(`✅ Found ${trades.length} recent trades`);

            // Показываем последнюю сделку
            const lastTrade = trades[0];
            if (lastTrade) {
                console.log(`   Last trade: ${lastTrade.side} ${lastTrade.outcome} @ ${(lastTrade.price * 100).toFixed(1)}%`);
                console.log(`   Size: $${lastTrade.notional.toFixed(2)}`);
                console.log(`   Time: ${lastTrade.timestamp.toLocaleString()}`);
            }
        }

        // Добавляем кошелек
        const wallet = walletStore.addWallet(address, name);

        console.log(`\n✅ Wallet added successfully!`);
        console.log(`   Address: ${wallet.address}`);
        if (wallet.name) {
            console.log(`   Name: ${wallet.name}`);
        }
        console.log(`   Status: ${wallet.status}`);
        console.log(`\nRun 'npm run check-wallets' to start monitoring.`);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error: ${message}`);
        process.exit(1);
    }
}

void main();
