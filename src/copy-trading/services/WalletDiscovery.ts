/**
 * Сервис для поиска топ кошельков через scraping Polymarket Leaderboard
 */

import axios from 'axios';
import { WalletProfile, DiscoveryResult } from '../types';

export interface DiscoveryOptions {
    limit?: number;              // Сколько кошельков получить (default: 50)
    sortBy?: 'volume' | 'profit'; // Сортировка (default: 'profit')
    minVolume?: number;          // Минимальный объем в USDC
    minProfit?: number;          // Минимальная прибыль в USDC
}

export class WalletDiscovery {

    /**
     * Получить топ кошельки из leaderboard
     */
    async discoverTopWallets(options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
        const {
            limit = 50,
            sortBy = 'profit',
            minVolume = 0,
            minProfit = 0
        } = options;

        console.log(`\n🔍 Discovering top wallets from Polymarket Leaderboard...`);
        console.log(`   Sort by: ${sortBy}`);
        console.log(`   Limit: ${limit}`);
        console.log(`   Min volume: $${minVolume}`);
        console.log(`   Min profit: $${minProfit}\n`);

        try {
            // Пытаемся получить данные через API или scraping
            const wallets = await this.fetchLeaderboardData(sortBy, limit);

            // Фильтруем по критериям
            const filtered = wallets.filter(w => {
                if (minVolume > 0 && w.stats.totalVolume < minVolume) {
                    return false;
                }
                // Для profit нужно проверить ROI или использовать другую метрику
                // Пока используем totalVolume как proxy для profit
                return true;
            });

            // Ограничиваем количество
            const limited = filtered.slice(0, limit);

            console.log(`✅ Found ${limited.length} wallets matching criteria\n`);

            return {
                wallets: limited,
                totalFound: wallets.length,
                source: `polymarket-leaderboard-${sortBy}`,
                fetchedAt: new Date()
            };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ Discovery failed: ${message}`);
            throw error;
        }
    }

    /**
     * Получить данные из leaderboard (scraping)
     * 
     * Примечание: Polymarket leaderboard может использовать динамическую загрузку через JS,
     * поэтому используем альтернативный метод - анализ последних сделок через API
     */
    private async fetchLeaderboardData(_sortBy: 'volume' | 'profit', limit: number): Promise<WalletProfile[]> {
        // Пока используем альтернативный метод, так как scraping сложен из-за JS-рендеринга
        console.log(`   Note: Leaderboard scraping may require JS rendering. Using API method instead...`);
        return this.discoverFromRecentTrades(limit);
    }

    /**
     * Альтернативный метод: анализ последних сделок для поиска активных кошельков
     */
    private async discoverFromRecentTrades(limit: number): Promise<WalletProfile[]> {
        try {
            console.log(`   Using alternative method: analyzing recent trades from API...`);
            const tradesUrl = 'https://data-api.polymarket.com/trades';
            const response = await axios.get(tradesUrl, {
                params: {
                    limit: 1000  // Получаем много сделок для анализа
                },
                timeout: 15000
            });

            console.log(`   Received ${Array.isArray(response.data) ? response.data.length : 0} trades`);

            const trades = response.data as Array<Record<string, unknown>>;

            // Проверяем структуру данных (может быть owner или другой ключ)
            if (trades.length > 0) {
                console.log(`   Sample trade keys: ${Object.keys(trades[0] || {}).join(', ')}`);
            }

            // Агрегируем по кошелькам
            const walletStats = new Map<string, { volume: number; trades: number }>();

            for (const trade of trades) {
                // Пытаемся найти адрес кошелька в разных полях (API использует proxyWallet)
                const owner = (trade.proxyWallet || trade.owner || trade.user || trade.address || trade.wallet) as string | undefined;
                const priceStr = (trade.price || trade.execution_price) as string | undefined;
                const sizeStr = (trade.size || trade.amount) as string | undefined;

                if (!owner || !priceStr || !sizeStr) continue;

                const address = owner.toLowerCase();
                const price = parseFloat(priceStr);
                const size = parseFloat(sizeStr);
                const volume = price * size;

                const existing = walletStats.get(address) || { volume: 0, trades: 0 };
                existing.volume += volume;
                existing.trades += 1;
                walletStats.set(address, existing);
            }

            // Сортируем по объему и берем топ
            const sorted = Array.from(walletStats.entries())
                .sort((a, b) => b[1].volume - a[1].volume)
                .slice(0, limit);

            console.log(`   Found ${sorted.length} unique wallets with activity`);

            return sorted.map(([address, stats]) => ({
                address,
                source: 'discovery',
                status: 'candidate' as const,
                stats: {
                    totalTrades: stats.trades,
                    totalVolume: stats.volume,
                    roi: 0, // Не можем рассчитать без resolved markets
                    winRate: 0.5 // Placeholder
                },
                createdAt: new Date()
            }));

        } catch (error) {
            console.error(`   Alternative method also failed: ${error}`);
            return [];
        }
    }
}

