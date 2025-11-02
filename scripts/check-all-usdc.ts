import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

dotenvConfig({ path: resolve(__dirname, "../.env") });

// Разные версии USDC на Polygon
const USDC_CONTRACTS = {
    "USDC (Native)": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    "USDC.e (Bridged)": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
};

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)"
];

async function checkAllUSDC() {
    console.log("💰 Проверка всех версий USDC на Polygon\n");

    if (!process.env.FUNDER_ADDRESS) {
        console.log("❌ FUNDER_ADDRESS не найден в .env");
        return;
    }

    const address = process.env.FUNDER_ADDRESS;
    const rpcUrl = "https://polygon-rpc.com";
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    console.log(`📍 Адрес: ${address}\n`);

    for (const [name, contractAddress] of Object.entries(USDC_CONTRACTS)) {
        try {
            const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);

            const [balance, decimals, symbol, fullName] = await Promise.all([
                contract.balanceOf(address),
                contract.decimals(),
                contract.symbol(),
                contract.name()
            ]);

            const formatted = ethers.utils.formatUnits(balance, decimals);

            console.log(`${name}:`);
            console.log(`   Контракт: ${contractAddress}`);
            console.log(`   Название: ${fullName} (${symbol})`);
            console.log(`   Баланс: ${parseFloat(formatted).toLocaleString()} ${symbol}`);

            if (parseFloat(formatted) > 0) {
                console.log(`   ✅ Найден баланс!`);
            } else {
                console.log(`   ⚪ Нет баланса`);
            }
            console.log();

        } catch (error: any) {
            console.log(`❌ Ошибка проверки ${name}:`, error.message);
            console.log();
        }
    }

    console.log("🔗 Проверить все токены на explorer:");
    console.log(`   https://polygonscan.com/address/${address}#tokentxns`);
}

checkAllUSDC().catch(console.error);
