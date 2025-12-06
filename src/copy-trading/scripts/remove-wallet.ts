/**
 * Удалить кошелек из отслеживания
 *
 * Использование:
 *   npm run remove-wallet <address>
 */

import { WalletStore } from '../storage/WalletStore';

function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
Usage: npm run remove-wallet <address>

Example:
  npm run remove-wallet 0x1234567890abcdef1234567890abcdef12345678
`);
        process.exit(1);
    }

    const address = args[0];
    if (!address) {
        console.error('❌ Address is required.');
        process.exit(1);
    }

    const walletStore = new WalletStore();
    const removed = walletStore.removeWallet(address);

    if (removed) {
        console.log(`✅ Wallet ${address} removed successfully.`);
    } else {
        console.log(`❌ Wallet ${address} not found.`);
        process.exit(1);
    }
}

main();
