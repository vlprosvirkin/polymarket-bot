/**
 * Adapters - единая точка экспорта всех адаптеров
 */

// Polymarket APIs
export { GammaApiAdapter } from './gamma-api';
export type { GammaMarket, GammaMarketResponse } from './gamma-api';

export { PolymarketDataAdapter } from './polymarket-data.adapter';
export type {
    EnrichedMarket,
    OrderbookData,
    LiquidityMetrics,
    GetMarketsParams
} from './polymarket-data.adapter';

// Search APIs
export { SerpApiAdapter } from './serp-api.adapter';
export type {
    NewsArticle,
    OrganicResult,
    SerpSearchOptions,
    EventInfoResult
} from './serp-api.adapter';

export { TavilyAdapter } from './tavily.adapter';
export type {
    TavilySearchResult,
    TavilySearchResponse,
    TavilySearchOptions
} from './tavily.adapter';

// Messaging
export { TelegramAdapter } from './telegram.adapter';
export type {
    TelegramMessage,
    TelegramBotInfo
} from './telegram.adapter';
