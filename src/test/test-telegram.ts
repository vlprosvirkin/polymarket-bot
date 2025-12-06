/**
 * Test Script: Telegram Integration Test
 * 
 * Tests TelegramAdapter and TelegramBot functionality
 * 
 * Requirements:
 * - TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env
 * - Valid Telegram bot token
 * - Bot must be started in Telegram (send /start)
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";
import { TelegramAdapter } from "../adapters/telegram.adapter";
import { TelegramBot } from "../services/TelegramBot";
import { getErrorMessage } from "../types/errors";

dotenvConfig({ path: resolve(__dirname, "../../.env") });

async function testTelegramAdapter() {
    console.warn("🧪 Testing TelegramAdapter\n");
    console.warn("=".repeat(70));

    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
        console.warn("⚠️  TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in .env");
        console.warn("   Skipping Telegram adapter tests");
        return { success: false, skipped: true };
    }

    try {
        // Test 1: Create adapter
        console.warn("\n1️⃣ Creating TelegramAdapter...");
        const adapter = new TelegramAdapter();
        console.warn("   ✅ Adapter created");

        // Test 2: Connect
        console.warn("\n2️⃣ Connecting to Telegram...");
        await adapter.connect();
        console.warn("   ✅ Connected successfully");
        console.warn(`   ✅ Connection status: ${adapter.isConnected()}`);

        // Test 3: Send simple message
        console.warn("\n3️⃣ Sending test message...");
        await adapter.sendMessage({
            text: "🧪 Test message from Polymarket Bot\n\nThis is a test of the Telegram integration."
        });
        console.warn("   ✅ Message sent successfully");

        // Test 4: Send HTML formatted message
        console.warn("\n4️⃣ Sending HTML formatted message...");
        await adapter.sendMessage({
            text: "<b>Bold</b> and <i>italic</i> text\n\n<code>Code block</code>",
            parse_mode: "HTML"
        });
        console.warn("   ✅ HTML message sent successfully");

        // Test 5: Disconnect
        console.warn("\n5️⃣ Disconnecting...");
        await adapter.disconnect();
        console.warn(`   ✅ Disconnected (status: ${adapter.isConnected()})`);

        return { success: true, adapter };

    } catch (error) {
        console.error("\n❌ Error testing TelegramAdapter:", getErrorMessage(error));
        return { success: false, error: getErrorMessage(error) };
    }
}

async function testTelegramBot() {
    console.warn("\n\n🧪 Testing TelegramBot\n");
    console.warn("=".repeat(70));

    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
        console.warn("⚠️  TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in .env");
        console.warn("   Skipping Telegram bot tests");
        return { success: false, skipped: true };
    }

    if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
        console.warn("⚠️  PK or FUNDER_ADDRESS not set in .env");
        console.warn("   Skipping Telegram bot tests (requires ClobClient)");
        return { success: false, skipped: true };
    }

    try {
        // Initialize ClobClient
        console.warn("\n1️⃣ Initializing ClobClient...");
        const { ethers } = await import("ethers");
        const wallet = new ethers.Wallet(process.env.PK);
        const host = process.env.CLOB_API_URL || "https://clob.polymarket.com";
        const chainId = parseInt(process.env.CHAIN_ID || "137");

        const tempClient = new ClobClient(host, chainId, wallet);
        const creds = await tempClient.createOrDeriveApiKey();

        const client = new ClobClient(
            host,
            chainId,
            wallet,
            creds,
            parseInt(process.env.SIGNATURE_TYPE || "0"),
            process.env.FUNDER_ADDRESS
        );
        console.warn("   ✅ ClobClient initialized");

        // Initialize TelegramAdapter
        console.warn("\n2️⃣ Initializing TelegramAdapter...");
        const adapter = new TelegramAdapter();
        await adapter.connect();
        console.warn("   ✅ TelegramAdapter connected");

        // Initialize TelegramBot
        console.warn("\n3️⃣ Creating TelegramBot...");
        const bot = new TelegramBot(adapter, client);
        console.warn("   ✅ TelegramBot created");

        // Test 4: Test notification methods
        console.warn("\n4️⃣ Testing notification methods...");

        // Test order placed notification
        console.warn("   📤 Testing notifyOrderPlaced...");
        await bot.notifyOrderPlaced(
            "0x1234567890abcdef",
            "BUY",
            "Yes",
            0.85,
            10,
            "Test Market: Will this test pass?"
        );
        console.warn("   ✅ Order placed notification sent");

        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

        // Test order error notification
        console.warn("   📤 Testing notifyOrderError...");
        await bot.notifyOrderError(
            "Test Market: Will this test pass?",
            "Test error message"
        );
        console.warn("   ✅ Order error notification sent");

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test position closed notification
        console.warn("   📤 Testing notifyPositionClosed...");
        await bot.notifyPositionClosed(
            "Test Market: Will this test pass?",
            2.50,
            "Профит: 95.00%"
        );
        console.warn("   ✅ Position closed notification sent");

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test trade executed notification
        console.warn("   📤 Testing notifyTradeExecuted...");
        await bot.notifyTradeExecuted(
            "BUY",
            "Yes",
            0.85,
            10,
            "Test Market: Will this test pass?"
        );
        console.warn("   ✅ Trade executed notification sent");

        // Test 5: Test command handling (simulate update)
        console.warn("\n5️⃣ Testing command handling...");
        
        const testUpdate = {
            update_id: 123456,
            message: {
                message_id: 1,
                from: {
                    id: parseInt(process.env.TELEGRAM_CHAT_ID || "0"),
                    username: "test_user"
                },
                chat: {
                    id: parseInt(process.env.TELEGRAM_CHAT_ID || "0"),
                    type: "private"
                },
                text: "/help",
                date: Math.floor(Date.now() / 1000)
            }
        };

        console.warn("   📤 Simulating /help command...");
        await bot.handleUpdate(testUpdate);
        console.warn("   ✅ Command handled (check Telegram for response)");

        return { success: true, bot };

    } catch (error) {
        console.error("\n❌ Error testing TelegramBot:", getErrorMessage(error));
        return { success: false, error: getErrorMessage(error) };
    }
}

async function testTelegramIntegration() {
    console.warn(`
╔════════════════════════════════════════════════════════════════╗
║              TELEGRAM INTEGRATION TEST                        ║
║         Testing TelegramAdapter and TelegramBot                 ║
╚════════════════════════════════════════════════════════════════╝
`);

    const adapterResult = await testTelegramAdapter();
    const botResult = await testTelegramBot();

    console.warn("\n\n" + "=".repeat(70));
    console.warn("📊 TEST RESULTS");
    console.warn("=".repeat(70));

    if (adapterResult.success) {
        console.warn("✅ TelegramAdapter: PASSED");
    } else if (adapterResult.skipped) {
        console.warn("⏭️  TelegramAdapter: SKIPPED (missing env vars)");
    } else {
        console.warn("❌ TelegramAdapter: FAILED");
        if (adapterResult.error) {
            console.warn(`   Error: ${adapterResult.error}`);
        }
    }

    if (botResult.success) {
        console.warn("✅ TelegramBot: PASSED");
    } else if (botResult.skipped) {
        console.warn("⏭️  TelegramBot: SKIPPED (missing env vars)");
    } else {
        console.warn("❌ TelegramBot: FAILED");
        if (botResult.error) {
            console.warn(`   Error: ${botResult.error}`);
        }
    }

    console.warn("\n" + "=".repeat(70));

    if (adapterResult.success && botResult.success) {
        console.warn("\n✅ All tests passed!");
        console.warn("\n💡 Check your Telegram chat for test messages");
        return 0;
    } else if (adapterResult.skipped || botResult.skipped) {
        console.warn("\n⚠️  Some tests were skipped");
        console.warn("   Make sure to set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env");
        return 0;
    } else {
        console.warn("\n❌ Some tests failed");
        return 1;
    }
}

// Run tests
testTelegramIntegration()
    .then((exitCode) => {
        process.exit(exitCode);
    })
    .catch((error) => {
        console.error("\n💥 Unexpected error:", error);
        process.exit(1);
    });

