import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

dotenvConfig({ path: resolve(__dirname, "../.env") });

// USDC contract addresses on Polygon
const USDC_NATIVE = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; // Native USDC (new)
const USDC_BRIDGED = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e (old, bridged)

// ERC20 ABI (только нужные функции)
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

async function checkBalance() {
    console.log("💰 Проверка баланса кошелька\n");

    if (!process.env.PK) {
        console.log("❌ Ошибка: PK не найден в .env");
        return;
    }

    if (!process.env.FUNDER_ADDRESS) {
        console.log("❌ Ошибка: FUNDER_ADDRESS не найден в .env");
        return;
    }

    const chainId = process.env.CHAIN_ID || "137";
    const address = process.env.FUNDER_ADDRESS;

    console.log(`📍 Адрес: ${address}`);
    console.log(`🔗 Chain: ${chainId === "137" ? "Polygon Mainnet" : "Amoy Testnet"}\n`);

    try {
        // Подключение к Polygon RPC
        const rpcUrl = chainId === "137"
            ? "https://polygon-rpc.com"
            : "https://rpc-amoy.polygon.technology";

        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

        // 1. Проверка баланса MATIC
        console.log("🔍 Проверка балансов...\n");
        const maticBalance = await provider.getBalance(address);
        const maticFormatted = ethers.utils.formatEther(maticBalance);

        console.log("💎 MATIC:");
        console.log(`   Баланс: ${maticFormatted} MATIC`);

        if (parseFloat(maticFormatted) < 0.1) {
            console.log(`   ⚠️  Низкий баланс! Рекомендуется иметь минимум 0.1 MATIC для gas`);
        } else {
            console.log(`   ✅ Достаточно для gas`);
        }

        // 2. Проверка баланса USDC (обе версии)
        const usdcNativeContract = new ethers.Contract(USDC_NATIVE, ERC20_ABI, provider);
        const usdcBridgedContract = new ethers.Contract(USDC_BRIDGED, ERC20_ABI, provider);

        const usdcNativeBalance = await usdcNativeContract.balanceOf(address);
        const usdcBridgedBalance = await usdcBridgedContract.balanceOf(address);

        const usdcNativeDecimals = await usdcNativeContract.decimals();
        const usdcBridgedDecimals = await usdcBridgedContract.decimals();

        const usdcNativeFormatted = ethers.utils.formatUnits(usdcNativeBalance, usdcNativeDecimals);
        const usdcBridgedFormatted = ethers.utils.formatUnits(usdcBridgedBalance, usdcBridgedDecimals);

        const totalUsdc = parseFloat(usdcNativeFormatted) + parseFloat(usdcBridgedFormatted);

        console.log("\n💵 USDC:");
        console.log(`   Native USDC:  ${parseFloat(usdcNativeFormatted).toLocaleString()} USDC`);
        console.log(`   Bridged USDC: ${parseFloat(usdcBridgedFormatted).toLocaleString()} USDC.e`);
        console.log(`   Всего:        ${totalUsdc.toLocaleString()} USDC`);

        if (totalUsdc < 10) {
            console.log(`   ⚠️  Низкий баланс! Рекомендуется иметь минимум 10 USDC для торговли`);
        } else {
            console.log(`   ✅ Готов к торговле`);
        }

        // 3. Информация о сети
        console.log("\n📊 Информация о сети:");
        const blockNumber = await provider.getBlockNumber();
        const gasPrice = await provider.getGasPrice();

        console.log(`   Текущий блок: ${blockNumber}`);
        console.log(`   Gas Price: ${ethers.utils.formatUnits(gasPrice, "gwei")} GWEI`);

        // 4. Подсчет примерной стоимости транзакции
        const estimatedGas = ethers.BigNumber.from("100000"); // Примерный gas limit
        const txCost = gasPrice.mul(estimatedGas);
        const txCostMatic = ethers.utils.formatEther(txCost);

        console.log(`   Примерная стоимость tx: ${txCostMatic} MATIC`);

        // 5. Итоговая проверка готовности
        console.log("\n" + "=".repeat(60));
        console.log("✅ СТАТУС ГОТОВНОСТИ К ТОРГОВЛЕ");
        console.log("=".repeat(60));

        const hasEnoughMatic = parseFloat(maticFormatted) >= 0.1;
        const hasEnoughUsdc = totalUsdc >= 10;

        if (hasEnoughMatic && hasEnoughUsdc) {
            console.log("🎉 Кошелек готов к торговле!");
            console.log("\n📝 Следующие шаги:");
            console.log("   1. Запустите: npm run test:api");
            console.log("   2. Проверьте подключение к Polymarket");
            console.log("   3. Начните с тестовых ордеров");
        } else {
            console.log("⚠️  Кошелек НЕ готов к торговле\n");

            if (!hasEnoughMatic) {
                console.log("📍 Необходимо пополнить MATIC:");
                console.log(`   1. Отправьте минимум 0.1 MATIC на адрес: ${address}`);
                console.log(`   2. Polygon Bridge: https://wallet.polygon.technology/`);
                console.log(`   3. Polygon Faucet (testnet): https://faucet.polygon.technology/`);
            }

            if (!hasEnoughUsdc) {
                console.log("\n💵 Необходимо пополнить USDC:");
                console.log(`   1. Отправьте USDC на адрес: ${address}`);
                console.log(`   2. Polygon Bridge: https://wallet.polygon.technology/`);
                console.log(`   3. Купите на бирже и выведите на Polygon`);
            }
        }

        // 6. Полезные ссылки
        console.log("\n🔗 Полезные ссылки:");
        console.log(`   Explorer: https://polygonscan.com/address/${address}`);
        console.log(`   Polymarket: https://polymarket.com`);

    } catch (error: any) {
        console.error("\n❌ Ошибка при проверке баланса:", error.message);

        if (error.code === "NETWORK_ERROR") {
            console.log("\n💡 Проверьте подключение к интернету");
        }
    }
}

checkBalance()
    .catch((error) => {
        console.error("💥 Критическая ошибка:", error);
        process.exit(1);
    });
