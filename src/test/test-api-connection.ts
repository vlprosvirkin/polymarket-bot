/**
 * Test Script: Polymarket API Connection Test
 *
 * This script demonstrates:
 * 1. Connecting to Polymarket CLOB API
 * 2. Fetching available markets/pools
 * 3. Getting market prices and order book data
 * 4. Placing a test order (commented out for safety)
 */

// import { ethers } from "ethers"; // Используется только в закомментированной функции
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { ClobClient } from "@polymarket/clob-client";

// Load environment variables
dotenvConfig({ path: resolve(__dirname, "../../.env") });

// Используем типы из @polymarket/clob-client или наши типы из src/types/market.ts

async function testApiConnection() {
    console.log("🚀 Starting Polymarket API Connection Test...\n");

    // Step 1: Initialize read-only client (no wallet needed for market data)
    console.log("📡 Step 1: Connecting to Polymarket CLOB API...");
    const host = process.env.CLOB_API_URL || "https://clob.polymarket.com";
    const chainId = parseInt(process.env.CHAIN_ID || "137");

    const clobClient = new ClobClient(host, chainId);
    console.log(`✅ Connected to: ${host} (Chain ID: ${chainId})\n`);

    // Step 2: Fetch available markets
    console.log("📊 Step 2: Fetching available markets...");
    try {
        const marketsResponse = await clobClient.getSamplingMarkets();
        const markets = marketsResponse.data || [];
        console.log(`✅ Found ${markets.length} markets\n`);

        // Display first 5 active markets
        console.log("🎯 Top 5 Active Markets:");
        console.log("=" .repeat(80));

        const activeMarkets = markets
            .filter((m: any) => m.active && !m.closed)
            .slice(0, 5);

        activeMarkets.forEach((market: any, index: number) => {
            console.log(`\n${index + 1}. ${market.question}`);
            console.log(`   Condition ID: ${market.condition_id}`);
            console.log(`   End Date: ${market.end_date_iso}`);
            console.log(`   Volume: $${parseFloat(market.volume || "0").toLocaleString()}`);

            if (market.tokens && market.tokens.length > 0) {
                console.log(`   Tokens:`);
                market.tokens.forEach((token: any) => {
                    console.log(`      - ${token.outcome}: ${token.token_id.substring(0, 20)}...`);
                    console.log(`        Current Price: ${(token.price * 100).toFixed(2)}%`);
                });
            }
        });

        console.log("\n" + "=".repeat(80));

        // Step 3: Get detailed price information for first active market
        if (activeMarkets.length > 0) {
            const firstMarket = activeMarkets[0];
            console.log(`\n📈 Step 3: Getting detailed prices for: "${firstMarket.question}"`);

            if (firstMarket.tokens && firstMarket.tokens.length > 0) {
                const yesToken = firstMarket.tokens[0];

                try {
                    // Get buy and sell prices
                    const buyPrice = await clobClient.getPrice(yesToken.token_id, "buy");
                    const sellPrice = await clobClient.getPrice(yesToken.token_id, "sell");
                    const midpoint = await clobClient.getMidpoint(yesToken.token_id);

                    console.log(`\n   Token: ${yesToken.outcome}`);
                    console.log(`   Buy Price:  ${(parseFloat(buyPrice) * 100).toFixed(2)}% (probability to buy YES)`);
                    console.log(`   Sell Price: ${(parseFloat(sellPrice) * 100).toFixed(2)}% (probability to sell YES)`);
                    console.log(`   Midpoint:   ${(parseFloat(midpoint) * 100).toFixed(2)}%`);
                    console.log(`   Spread:     ${((parseFloat(buyPrice) - parseFloat(sellPrice)) * 100).toFixed(2)}%`);
                } catch (error: any) {
                    console.log(`   ⚠️  Could not fetch prices: ${error.message}`);
                }
            }
        }

        // Step 4: Demonstrate order placement (COMMENTED OUT FOR SAFETY)
        console.log(`\n\n💰 Step 4: Order Placement (Demo - NOT EXECUTED)`);
        console.log("=" .repeat(80));
        console.log(`
To place an order, you need to:
1. Create a .env file with your private key and funder address
2. Uncomment the placeTestOrder() function below
3. Make sure you have USDC in your wallet

Example order code:
`);

        showOrderExample(activeMarkets[0]);

        return { success: true, markets: activeMarkets };

    } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
        if (error.response) {
            console.error(`Response status: ${error.response.status}`);
            console.error(`Response data:`, error.response.data);
        }
        return { success: false, error: error.message };
    }
}

function showOrderExample(market: any) {
    if (!market || !market.tokens || market.tokens.length === 0) {
        console.log("No market data available for example");
        return;
    }

    const token = market.tokens[0];

    console.log(`
// Initialize authenticated client
const wallet = new ethers.Wallet(process.env.PK!);
const funder = process.env.FUNDER_ADDRESS!;
const signatureType = parseInt(process.env.SIGNATURE_TYPE || "1");

// Create or derive API key
const creds = await new ClobClient(host, chainId, wallet).createOrDeriveApiKey();
const authClient = new ClobClient(host, chainId, wallet, creds, signatureType, funder);

// Place a BUY order for ${token.outcome}
const order = await authClient.createAndPostOrder(
    {
        tokenID: "${token.token_id}",
        price: ${(token.price * 1.01).toFixed(3)}, // 1% above current price
        side: Side.BUY,
        size: 10, // Buy 10 shares
    },
    {
        tickSize: "0.01",  // Get from market metadata
        negRisk: false     // Get from market metadata
    },
    OrderType.GTC  // Good Till Cancelled
);

console.log("Order placed:", order);
`);
}

/*
// Функция для тестирования размещения ордеров (закомментирована, т.к. не используется в автоматических тестах)
async function _placeTestOrder() {
    console.log("\n\n🔐 Step 5: Placing Test Order (AUTHENTICATED)");
    console.log("=" .repeat(80));

    // Check if credentials are available
    if (!process.env.PK || !process.env.FUNDER_ADDRESS) {
        console.log("⚠️  Skipping order placement: Missing PK or FUNDER_ADDRESS in .env");
        console.log("   Create a .env file based on .env.example to test order placement");
        return;
    }

    try {
        const wallet = new ethers.Wallet(process.env.PK);
        const funder = process.env.FUNDER_ADDRESS;
        const host = process.env.CLOB_API_URL || "https://clob.polymarket.com";
        const chainId = parseInt(process.env.CHAIN_ID || "137");
        const signatureType = parseInt(process.env.SIGNATURE_TYPE || "1");

        console.log(`Wallet Address: ${await wallet.getAddress()}`);
        console.log(`Funder Address: ${funder}`);

        // Create or derive API key
        console.log("\n🔑 Creating/Deriving API key...");
        const creds = await new ClobClient(host, chainId, wallet).createOrDeriveApiKey();
        console.log("✅ API key obtained");

        // Initialize authenticated client
        const authClient = new ClobClient(host, chainId, wallet, creds, signatureType, funder);

        // Get a test market
        const marketsResponse = await authClient.getSamplingSimplifiedMarkets();
        const markets = marketsResponse.data || [];
        const activeMarket = markets.find((m: any) => m.active && !m.closed);

        if (!activeMarket || !activeMarket.tokens) {
            console.log("❌ No active market found");
            return;
        }

        const token = activeMarket.tokens[0];
        console.log(`\n📝 Placing order for: ${activeMarket.question}`);
        console.log(`Token: ${token.outcome} (${token.token_id.substring(0, 20)}...)`);

        // UNCOMMENT BELOW TO ACTUALLY PLACE AN ORDER
        // const order = await authClient.createAndPostOrder(
        //     {
        //         tokenID: token.token_id,
        //         price: 0.01, // Very low price for safety
        //         side: Side.BUY,
        //         size: 1, // Minimal size
        //     },
        //     {
        //         tickSize: "0.01",
        //         negRisk: false
        //     },
        //     OrderType.GTC
        // );
        //
        // console.log("✅ Order placed successfully:");
        // console.log(order);

        console.log("\n⚠️  Order placement code is commented out for safety");
        console.log("   Uncomment the order placement code above to test");

    } catch (error: any) {
        console.error(`❌ Error placing order: ${error.message}`);
        if (error.response) {
            console.error(`Response:`, error.response.data);
        }
    }
}
*/

// Run the test
testApiConnection()
    .then(async (result) => {
        if (result.success) {
            console.log("\n\n✅ API Connection Test Completed Successfully!");

            // Optionally uncomment to test authenticated order placement
            // await placeTestOrder();
        } else {
            console.log("\n\n❌ API Connection Test Failed");
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error("\n\n💥 Unexpected Error:", error);
        process.exit(1);
    });
