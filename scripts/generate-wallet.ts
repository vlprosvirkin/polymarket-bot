import { ethers } from "ethers";

/**
 * Generate a new Ethereum wallet for the bot
 */

console.log("🔐 Генерация нового кошелька для Polymarket Bot\n");

// Генерируем новый случайный кошелек
const wallet = ethers.Wallet.createRandom();

console.log("=" .repeat(70));
console.log("✅ НОВЫЙ КОШЕЛЕК УСПЕШНО СОЗДАН");
console.log("=" .repeat(70));

console.log("\n📋 Скопируйте эти данные в .env файл:\n");

console.log("PK=" + wallet.privateKey.substring(2)); // Убираем префикс 0x
console.log("FUNDER_ADDRESS=" + wallet.address);

console.log("\n" + "=" .repeat(70));
console.log("📊 Полная информация о кошельке:");
console.log("=" .repeat(70));

console.log("\n🔑 Приватный ключ (С 0x):");
console.log(wallet.privateKey);

console.log("\n🔑 Приватный ключ (БЕЗ 0x - для .env):");
console.log(wallet.privateKey.substring(2));

console.log("\n👤 Публичный адрес:");
console.log(wallet.address);

if (wallet.mnemonic) {
    console.log("\n🔤 Мнемоническая фраза (seed phrase):");
    console.log(wallet.mnemonic.phrase);
}

console.log("\n" + "=" .repeat(70));
console.log("⚠️  КРИТИЧЕСКИ ВАЖНО!");
console.log("=" .repeat(70));

console.log(`
1. СОХРАНИТЕ приватный ключ и мнемоническую фразу в БЕЗОПАСНОМ месте
2. БЕЗ приватного ключа вы ПОТЕРЯЕТЕ доступ к средствам
3. НИКОГДА не делитесь приватным ключом
4. НЕ коммитьте .env файл в git
5. Используйте менеджер паролей для хранения

📝 Следующие шаги:

1. Скопируйте PK и FUNDER_ADDRESS в файл .env
2. Отправьте немного MATIC на адрес ${wallet.address} для gas
3. Отправьте USDC на адрес ${wallet.address} для торговли
4. Запустите: npm run verify
5. Запустите: npm run test:api

🔗 Полезные ссылки:

- Polygon Faucet: https://faucet.polygon.technology/
- Bridge USDC: https://wallet.polygon.technology/
- Polymarket: https://polymarket.com
`);

console.log("=" .repeat(70));
