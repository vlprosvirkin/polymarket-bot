/**
 * Типы для PostgreSQL адаптера
 * Универсальная схема для всего проекта
 */

// =====================================================
// CONFIG
// =====================================================

export interface DatabaseConfig {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: boolean | { rejectUnauthorized: boolean };
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
}

export interface QueryResult<T = Record<string, unknown>> {
    rows: T[];
    rowCount: number;
    command: string;
}

export interface Transaction {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
}

// =====================================================
// MARKETS
// =====================================================

export interface MarketRow {
    id: number;
    condition_id: string;
    question: string;
    description: string | null;
    market_slug: string;
    active: boolean;
    closed: boolean;
    archived: boolean;
    accepting_orders: boolean;
    minimum_order_size: number;
    minimum_tick_size: number;
    neg_risk: boolean;
    volume: number | null;
    volume_24hr: number | null;
    liquidity: number | null;
    tokens: unknown; // JSONB
    category: string | null;
    tags: string[] | null;
    end_date: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface MarketInsert {
    condition_id: string;
    question: string;
    description?: string;
    market_slug: string;
    active?: boolean;
    closed?: boolean;
    archived?: boolean;
    accepting_orders?: boolean;
    minimum_order_size?: number;
    minimum_tick_size?: number;
    neg_risk?: boolean;
    volume?: number;
    volume_24hr?: number;
    liquidity?: number;
    tokens?: unknown;
    category?: string;
    tags?: string[];
    end_date?: Date;
}

// =====================================================
// WALLETS (Copy Trading)
// =====================================================

export interface WalletRow {
    id: number;
    address: string;
    name: string | null;
    status: 'active' | 'paused';
    total_trades: number;
    winning_trades: number;
    total_pnl: number;
    roi: number;
    avg_trade_size: number;
    win_rate: number;
    added_at: Date;
    last_checked_at: Date | null;
    last_trade_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface WalletInsert {
    address: string;
    name?: string;
    status?: 'active' | 'paused';
}

export interface WalletStats {
    total_trades: number;
    winning_trades: number;
    total_pnl: number;
    roi: number;
    avg_trade_size: number;
    win_rate: number;
}

// =====================================================
// TRADES
// =====================================================

export type TradeSource = 'bot' | 'copy' | 'manual';
export type TradeStatus = 'pending' | 'filled' | 'cancelled' | 'failed';
export type TradeSide = 'BUY' | 'SELL';
export type TradeOutcome = 'Yes' | 'No';

export interface TradeRow {
    id: number;
    external_id: string | null;
    transaction_hash: string | null;
    source: TradeSource;
    wallet_address: string | null;
    condition_id: string;
    market_slug: string | null;
    question: string | null;
    side: TradeSide;
    outcome: TradeOutcome;
    token_id: string;
    price: number;
    size: number;
    notional: number;
    fee: number;
    status: TradeStatus;
    processed: boolean;
    trade_timestamp: Date;
    created_at: Date;
}

export interface TradeInsert {
    external_id?: string;
    transaction_hash?: string;
    source?: TradeSource;
    wallet_address?: string;
    condition_id: string;
    market_slug?: string;
    question?: string;
    side: TradeSide;
    outcome: TradeOutcome;
    token_id: string;
    price: number;
    size: number;
    notional: number;
    fee?: number;
    status?: TradeStatus;
    processed?: boolean;
    trade_timestamp: Date;
}

// =====================================================
// POSITIONS
// =====================================================

export type PositionStatus = 'open' | 'closed' | 'partial';
export type PositionType = 'LONG' | 'SHORT';

export interface PositionRow {
    id: number;
    token_id: string;
    condition_id: string;
    market_slug: string | null;
    question: string | null;
    outcome: TradeOutcome;
    side: TradeSide;
    position_type: PositionType;
    size: number;
    average_price: number;
    current_price: number | null;
    unrealized_pnl: number | null;
    realized_pnl: number;
    status: PositionStatus;
    source: TradeSource;
    strategy: string | null;
    opened_at: Date;
    closed_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface PositionInsert {
    token_id: string;
    condition_id: string;
    market_slug?: string;
    question?: string;
    outcome: TradeOutcome;
    side: TradeSide;
    position_type: PositionType;
    size: number;
    average_price: number;
    current_price?: number;
    source?: TradeSource;
    strategy?: string;
}

// =====================================================
// ORDERS
// =====================================================

export type OrderStatus = 'pending' | 'filled' | 'partial' | 'cancelled' | 'expired' | 'failed';
export type OrderType = 'GTC' | 'GTD' | 'FOK';

export interface OrderRow {
    id: number;
    order_id: string;
    token_id: string;
    condition_id: string;
    market_slug: string | null;
    side: TradeSide;
    price: number;
    size: number;
    filled_size: number;
    status: OrderStatus;
    order_type: OrderType;
    source: TradeSource;
    strategy: string | null;
    created_at: Date;
    updated_at: Date;
    filled_at: Date | null;
    expires_at: Date | null;
}

export interface OrderInsert {
    order_id: string;
    token_id: string;
    condition_id: string;
    market_slug?: string;
    side: TradeSide;
    price: number;
    size: number;
    order_type?: OrderType;
    source?: TradeSource;
    strategy?: string;
    expires_at?: Date;
}

// =====================================================
// SIGNALS
// =====================================================

export type SignalSource = 'copy' | 'ai' | 'strategy';
export type SignalAction = 'BUY' | 'SELL' | 'FOLLOW' | 'IGNORE' | 'HOLD';

export interface SignalRow {
    id: number;
    signal_id: string;
    source: SignalSource;
    wallet_address: string | null;
    wallet_name: string | null;
    strategy: string | null;
    condition_id: string;
    market_slug: string | null;
    question: string | null;
    token_id: string | null;
    action: SignalAction;
    side: TradeSide | null;
    outcome: TradeOutcome | null;
    confidence: number;
    suggested_price: number | null;
    suggested_size: number | null;
    max_price: number | null;
    reasons: string[];
    metadata: unknown | null;
    executed: boolean;
    executed_at: Date | null;
    order_id: string | null;
    created_at: Date;
}

export interface SignalInsert {
    source: SignalSource;
    wallet_address?: string;
    wallet_name?: string;
    strategy?: string;
    condition_id: string;
    market_slug?: string;
    question?: string;
    token_id?: string;
    action: SignalAction;
    side?: TradeSide;
    outcome?: TradeOutcome;
    confidence: number;
    suggested_price?: number;
    suggested_size?: number;
    max_price?: number;
    reasons: string[];
    metadata?: unknown;
}

// =====================================================
// AI ANALYSIS
// =====================================================

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AIAnalysisRow {
    id: number;
    condition_id: string;
    market_slug: string | null;
    question: string;
    ai_probability: number;
    market_price: number;
    edge: number;
    attractiveness: number;
    risk_level: RiskLevel;
    reasoning: string;
    news_summary: string | null;
    key_factors: string[] | null;
    model: string | null;
    tokens_used: number | null;
    cost_usd: number | null;
    analyzed_at: Date;
    expires_at: Date;
}

export interface AIAnalysisInsert {
    condition_id: string;
    market_slug?: string;
    question: string;
    ai_probability: number;
    market_price: number;
    edge: number;
    attractiveness: number;
    risk_level: RiskLevel;
    reasoning: string;
    news_summary?: string;
    key_factors?: string[];
    model?: string;
    tokens_used?: number;
    cost_usd?: number;
    expires_at: Date;
}

// =====================================================
// BOT STATS
// =====================================================

export interface BotStatsRow {
    id: number;
    date: Date;
    strategy: string | null;
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    total_volume: number;
    total_pnl: number;
    total_fees: number;
    ai_calls: number;
    ai_cost_usd: number;
    created_at: Date;
    updated_at: Date;
}

export interface BotStatsInsert {
    date: Date;
    strategy?: string;
    total_trades?: number;
    winning_trades?: number;
    losing_trades?: number;
    total_volume?: number;
    total_pnl?: number;
    total_fees?: number;
    ai_calls?: number;
    ai_cost_usd?: number;
}

// =====================================================
// PRICE HISTORY
// =====================================================

export interface PriceHistoryRow {
    id: number;
    condition_id: string;
    token_id: string;
    price: number;
    bid: number | null;
    ask: number | null;
    spread: number | null;
    recorded_at: Date;
}

export interface PriceHistoryInsert {
    condition_id: string;
    token_id: string;
    price: number;
    bid?: number;
    ask?: number;
    spread?: number;
}
