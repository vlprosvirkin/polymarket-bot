import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

dotenvConfig({ path: resolve(__dirname, "../.env") });

async function verifySetup() {
    console.log("🔍 Проверка настройки Polymarket Bot...\n");

    // 1. Проверка наличия переменных
    console.log("📋 Шаг 1: Проверка переменных окружения");

    if (!process.env.PK) {
        console.log("❌ Ошибка: PK не найден в .env");
        console.log("   Создайте файл .env на основе .env.example");
        return false;
    }
    console.log("✅ PK найден");

    if (!process.env.FUNDER_ADDRESS) {
        console.log("❌ Ошибка: FUNDER_ADDRESS не найден в .env");
        console.log("   Добавьте FUNDER_ADDRESS в .env");
        return false;
    }
    console.log("✅ FUNDER_ADDRESS найден");

    // 2. Создание кошелька из PK
    console.log("\n🔑 Шаг 2: Проверка приватного ключа");
    let wallet;
    try {
        wallet = new ethers.Wallet(process.env.PK);
        console.log("✅ Приватный ключ корректен");
    } catch (error: any) {
        console.log("❌ Ошибка: Некорректный приватный ключ");
        console.log(`   ${error.message}`);
        return false;
    }

    // 3. Получение адреса из PK
    console.log("\n🎯 Шаг 3: Проверка соответствия адресов");
    const addressFromPK = await wallet.getAddress();
    console.log(`   Адрес из PK:        ${addressFromPK}`);

    // 4. Сравнение с FUNDER_ADDRESS
    const funderAddress = process.env.FUNDER_ADDRESS;
    console.log(`   FUNDER_ADDRESS:     ${funderAddress}`);

    if (addressFromPK.toLowerCase() === funderAddress.toLowerCase()) {
        console.log("✅ PK и FUNDER_ADDRESS совпадают! (Рекомендуемая конфигурация)");
    } else {
        console.log("⚠️  ВНИМАНИЕ: PK и FUNDER_ADDRESS НЕ совпадают!");
        console.log("   Проверьте:");
        console.log("   1. Вы скопировали правильный PK?");
        console.log("   2. FUNDER_ADDRESS - это адрес от того же кошелька?");
        console.log("   3. Если используете proxy wallet, это нормально");
    }

    console.log("\n📊 Шаг 4: Конфигурация");
    const chainId = process.env.CHAIN_ID || "137";
    const signatureType = process.env.SIGNATURE_TYPE || "1";
    const apiUrl = process.env.CLOB_API_URL || "https://clob.polymarket.com";

    console.log(`   Chain ID:          ${chainId} ${chainId === "137" ? "(Polygon Mainnet)" : chainId === "80002" ? "(Amoy Testnet)" : ""}`);
    console.log(`   Signature Type:    ${signatureType} ${signatureType === "0" ? "(Browser Wallet)" : "(Magic/Email)"}`);
    console.log(`   CLOB API:          ${apiUrl}`);

    console.log("\n✅ Все проверки пройдены!");
    console.log("\n📝 Следующие шаги:");
    console.log("   1. Убедитесь, что на кошельке есть MATIC для gas");
    console.log("   2. Убедитесь, что на кошельке есть USDC для торговли");
    console.log("   3. Запустите: npm run test:api");

    return true;
}

verifySetup()
    .then((success) => {
        if (!success) {
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error("\n💥 Ошибка:", error);
        process.exit(1);
    });
