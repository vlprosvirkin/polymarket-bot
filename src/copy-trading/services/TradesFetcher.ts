/**
 * Сервис для получения сделок кошельков из Polymarket API
 */

import { WalletTrade, RawPolymarketTrade } from '../types';
import { COPY_TRADING_CONFIG } from '../config';

export class TradesFetcher {
    private baseUrl: string;

    constructor() {
        this.baseUrl = COPY_TRADING_CONFIG.api.tradesUrl;
    }

    /**
     * Получить последние сделки кошелька за указанный период
     */
    async getRecentTrades(
        walletAddress: string,
        windowMs: number = COPY_TRADING_CONFIG.tradeWindowMinutes * 60 * 1000
    ): Promise<WalletTrade[]> {
        try {
            // Получаем сделки из API
            const url = `${this.baseUrl}?user=${walletAddress}&limit=50`;

            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }

            const rawTrades = await response.json() as RawPolymarketTrade[];

            // Фильтруем по времени
            const cutoffTime = Date.now() - windowMs;
            const recentTrades = rawTrades.filter(trade => {
                const tradeTime = new Date(trade.match_time).getTime();
                return tradeTime >= cutoffTime;
            });

            // Нормализуем
            return recentTrades.map(raw => this.normalizeTrade(raw, walletAddress));

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ Failed to fetch trades for ${walletAddress}: ${message}`);
            return [];
        }
    }

    /**
     * Получить все сделки кошелька (для анализа статистики)
     */
    async getAllTrades(walletAddress: string, limit: number = 500): Promise<WalletTrade[]> {
        try {
            const url = `${this.baseUrl}?user=${walletAddress}&limit=${limit}`;

            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }

            const rawTrades = await response.json() as RawPolymarketTrade[];
            return rawTrades.map(raw => this.normalizeTrade(raw, walletAddress));

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ Failed to fetch trades for ${walletAddress}: ${message}`);
            return [];
        }
    }

    /**
     * Преобразовать сырые данные API в нормализованный формат
     */
    private normalizeTrade(raw: RawPolymarketTrade, walletAddress: string): WalletTrade {
        const price = parseFloat(raw.price);
        const size = parseFloat(raw.size);

        return {
            id: raw.id,
            wallet: walletAddress.toLowerCase(),
            transactionHash: raw.transaction_hash,

            // Рынок - используем market slug, вопрос получим позже если нужно
            conditionId: raw.asset_id, // token_id можно использовать для идентификации
            slug: raw.market,
            question: raw.market, // Пока используем slug как question

            // Сделка
            side: raw.side,
            outcome: raw.outcome as 'Yes' | 'No',
            tokenId: raw.asset_id,
            price,
            size,
            notional: price * size,

            timestamp: new Date(raw.match_time),
        };
    }
}
