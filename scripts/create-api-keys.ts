import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";

dotenvConfig({ path: resolve(__dirname, "../.env") });

async function createApiKeys() {
    console.log("🔑 Создание API ключей для Polymarket CLOB\n");

    if (!process.env.PK) {
        console.log("❌ Ошибка: PK не найден в .env");
        return;
    }

    const wallet = new ethers.Wallet(process.env.PK);
    const address = await wallet.getAddress();
    const host = process.env.CLOB_API_URL || "https://clob.polymarket.com";
    const chainId = parseInt(process.env.CHAIN_ID || "137");

    console.log(`👤 Адрес кошелька: ${address}`);
    console.log(`🔗 CLOB API: ${host}`);
    console.log(`⚙️  Chain ID: ${chainId}\n`);

    try {
        console.log("⏳ Генерация API ключей...");
        const clobClient = new ClobClient(host, chainId, wallet);
        const apiCreds = await clobClient.createOrDeriveApiKey();

        console.log("✅ API ключи успешно созданы!\n");

        console.log("=" .repeat(70));
        console.log("📋 Добавьте эти строки в ваш .env файл:");
        console.log("=" .repeat(70));
        console.log();
        console.log(`CLOB_API_KEY=${apiCreds.key}`);
        console.log(`CLOB_SECRET=${apiCreds.secret}`);
        console.log(`CLOB_PASS_PHRASE=${apiCreds.passphrase}`);
        console.log();
        console.log("=" .repeat(70));

        console.log("\n💡 Эти ключи:");
        console.log("   - Генерируются из вашего приватного ключа");
        console.log("   - Используются для аутентификации в CLOB API");
        console.log("   - Всегда одинаковые для одного кошелька");
        console.log("   - Можно безопасно пересоздать в любой момент");

        console.log("\n📝 Следующие шаги:");
        console.log("   1. Скопируйте строки выше в .env файл");
        console.log("   2. Запустите: npm run test:api");
        console.log("   3. Всё готово к торговле!");

    } catch (error: any) {
        console.error("\n❌ Ошибка при создании API ключей:", error.message);
        if (error.response) {
            console.error("Response:", error.response.data);
        }
    }
}

createApiKeys()
    .catch((error) => {
        console.error("\n💥 Критическая ошибка:", error);
        process.exit(1);
    });
