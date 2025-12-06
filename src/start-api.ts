/**
 * Запуск API сервера для мониторинга позиций
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";
import { ApiServer } from "./api/server";
import { TelegramAdapter } from "./adapters/telegram.adapter";
import { TelegramBot } from "./services/TelegramBot";

dotenvConfig({ path: resolve(__dirname, "../.env") });

async function startApiServer() {
    console.log("🚀 Запуск API сервера...\n");

    if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
        throw new Error("Missing PK or FUNDER_ADDRESS in .env");
    }

    const wallet = new ethers.Wallet(process.env.PK);
    const host = process.env.CLOB_API_URL || "https://clob.polymarket.com";
    const chainId = parseInt(process.env.CHAIN_ID || "137");
    const signatureType = parseInt(process.env.SIGNATURE_TYPE || "0");
    const port = parseInt(process.env.API_PORT || "3000");

    console.log(`👤 Wallet: ${await wallet.getAddress()}`);
    console.log(`🌐 CLOB API: ${host}`);
    console.log(`🔗 Chain ID: ${chainId}`);

    // Инициализация CLOB Client
    console.log("\n🔑 Получение API ключей...");
    const tempClient = new ClobClient(host, chainId, wallet);
    const creds = await tempClient.createOrDeriveApiKey();

    const client = new ClobClient(
        host,
        chainId,
        wallet,
        creds,
        signatureType,
        process.env.FUNDER_ADDRESS
    );

    console.log("✅ CLOB Client инициализирован");

    // Инициализация Telegram (опционально)
    let telegramBot: TelegramBot | undefined;
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        try {
            console.log("\n📱 Инициализация Telegram...");
            const telegramAdapter = new TelegramAdapter();
            await telegramAdapter.connect();
            telegramBot = new TelegramBot(telegramAdapter, client);
            console.log("✅ Telegram Bot инициализирован");
        } catch (error) {
            console.warn("⚠️  Telegram не настроен или ошибка подключения:", error);
        }
    } else {
        console.log("\n⚠️  Telegram не настроен (TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID отсутствуют)");
    }

    // Запуск API сервера
    const apiServer = new ApiServer(client, port, telegramBot);
    apiServer.start();
}

startApiServer().catch(error => {
    console.error("❌ Ошибка запуска сервера:", error);
    process.exit(1);
});
