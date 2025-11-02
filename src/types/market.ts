/**
 * Типы для Polymarket CLOB API
 * Основано на спецификации: https://docs.polymarket.com
 */

/**
 * Токен рынка (YES или NO outcome)
 */
export interface MarketToken {
    token_id: string;
    outcome: string; // "Yes" или "No"
    price: number; // 0.0 - 1.0
    winner: boolean;
}

/**
 * Рынок Polymarket
 */
export interface Market {
    condition_id: string;
    question: string;
    description: string;
    market_slug: string;
    end_date_iso: string;
    game_start_time?: string;

    // Статусы
    active: boolean;
    closed: boolean;
    archived: boolean;
    accepting_orders: boolean;
    accepting_order_timestamp?: string;

    // Торговые параметры
    minimum_order_size: number;
    minimum_tick_size: number;

    // Финансовые данные
    volume?: string; // "12345.67"
    volume_24hr?: string;
    liquidity?: string;

    // Риск
    neg_risk: boolean;
    neg_risk_market_id?: string;
    neg_risk_request_id?: string;

    // Токены
    tokens: MarketToken[];

    // Медиа
    icon?: string;
    image?: string;

    // Метаданные
    tags?: string[];
    category?: string;
    competitive?: number;
    ready?: boolean;
}

/**
 * Ответ от getSamplingMarkets()
 */
export interface SamplingMarketsResponse {
    data: Market[];
    count: number;
    limit: number;
    next_cursor: string; // "LTE=" когда больше нет данных
}

/**
 * Сторона ордера
 */
export enum OrderSide {
    BUY = "BUY",
    SELL = "SELL"
}

/**
 * Тип ордера
 */
export enum OrderTypeEnum {
    GTC = "GTC", // Good Till Cancelled
    FOK = "FOK", // Fill Or Kill
    GTD = "GTD", // Good Till Date
}

/**
 * Результат создания ордера
 */
export interface OrderResult {
    orderID: string;
    status: number; // HTTP status (200, 201, etc)
    success: boolean;
    errorMsg?: string;
    transactionsHashes?: string[];
}

/**
 * Открытый ордер
 */
export interface OpenOrder {
    id: string;
    market: string;
    asset_id: string;
    side: OrderSide;
    price: string;
    size_matched: string;
    original_size: string;
    outcome: string;
    created_at: string;
    expiration?: string;
    maker_address: string;
    owner: string;
}

/**
 * Сделка (Trade)
 */
export interface Trade {
    id: string;
    market: string;
    asset_id: string;
    side: OrderSide;
    price: string;
    size: string;
    fee_rate_bps: string;
    timestamp: number;
    outcome: string;
    bucket_index?: number;
    order_id?: string;
    trader_side?: string;
    transaction_hash?: string;
}

/**
 * Order Book
 */
export interface OrderBook {
    market: string;
    asset_id: string;
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
    hash: string;
    timestamp: string;
}

/**
 * Balance и Allowance
 */
export interface BalanceAllowance {
    balance: string;
    allowance: string;
}

/**
 * Параметры для создания ордера
 */
export interface CreateOrderParams {
    tokenID: string;
    price: number; // 0.01 - 0.99
    side: OrderSide;
    size: number; // количество токенов
    feeRateBps?: number;
    nonce?: number;
    expiration?: number;
}

/**
 * Опции для размещения ордера
 */
export interface OrderOptions {
    tickSize: string;
    negRisk: boolean;
}
