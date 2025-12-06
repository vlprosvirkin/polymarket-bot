/**
 * Типы для Copy Trading модуля
 */

/**
 * Статистика кошелька (опционально, заполняется вручную или автоматически)
 */
export interface WalletStats {
    totalTrades: number;
    totalVolume: number;      // В USDC
    roi: number;              // 0.25 = 25%
    winRate: number;          // 0.62 = 62%
    lastUpdated?: Date;
}

/**
 * Отслеживаемый кошелек
 */
export interface WatchedWallet {
    address: string;          // proxyWallet (Polygon)
    name?: string;            // Название для логов
    status: 'active' | 'paused';
    addedAt: Date;
    lastCheckedAt?: Date;
    stats?: WalletStats;
}

/**
 * Сделка кошелька (нормализованная)
 */
export interface WalletTrade {
    id: string;
    wallet: string;
    transactionHash?: string;

    // Рынок
    conditionId: string;
    slug: string;
    question: string;

    // Сделка
    side: 'BUY' | 'SELL';
    outcome: 'Yes' | 'No';
    tokenId: string;
    price: number;
    size: number;
    notional: number;         // price * size в USDC

    timestamp: Date;
}

/**
 * Сигнал на копирование
 */
export interface CopySignal {
    id: string;
    wallet: string;
    walletName?: string;
    trade: WalletTrade;

    action: 'FOLLOW' | 'IGNORE';
    confidence: number;       // 0-1
    reasons: string[];

    // Рекомендации для исполнения
    suggestedSize?: number;
    maxPrice?: number;

    createdAt: Date;
}

/**
 * Сырые данные сделки из Polymarket API
 */
export interface RawPolymarketTrade {
    id: string;
    taker_order_id: string;
    market: string;
    asset_id: string;
    side: 'BUY' | 'SELL';
    size: string;
    fee_rate_bps: string;
    price: string;
    status: string;
    match_time: string;
    last_update: string;
    outcome: string;
    bucket_index: number;
    owner: string;
    maker_address: string;
    transaction_hash?: string;
    trader_side?: string;
}

/**
 * Данные для хранения в wallets.json
 */
export interface WalletsData {
    wallets: WatchedWallet[];
}

/**
 * Данные для хранения в processed-trades.json
 */
export interface ProcessedTradesData {
    processedIds: string[];
    lastCleanup: string;
}

/**
 * Данные для хранения в signals.json
 */
export interface SignalsData {
    signals: CopySignal[];
}

/**
 * Профиль кошелька из leaderboard (для discovery)
 */
export interface WalletProfile {
    address: string;              // Polygon адрес
    displayName?: string;         // Имя/ENS если есть
    source: 'leaderboard' | 'polywhaler' | 'manual' | 'discovery';
    status: 'candidate' | 'active' | 'blocked' | 'paused';

    // Статистика из leaderboard
    stats: WalletStats;

    // Метаданные
    createdAt: Date;
    lastEvaluatedAt?: Date;
    lastTradeAt?: Date;
}

/**
 * Результат discovery
 */
export interface DiscoveryResult {
    wallets: WalletProfile[];
    totalFound: number;
    source: string;
    fetchedAt: Date;
}
