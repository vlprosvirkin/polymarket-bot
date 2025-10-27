// Типы на основе официального Polymarket CLOB API
// https://github.com/Polymarket/clob-client

export interface Market {
  id: string;
  question: string;
  description: string;
  endDate: string;
  outcomes: string[];
  volume: string;
  liquidity: string;
  isResolved: boolean;
  resolution: string | null;
  conditionId: string;
  collateralToken: string;
  collateralTokenDecimals: number;
  fee: string;
  image: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  winnerOutcome: string | null;
  resolutionSource: string | null;
  resolutionOperator: string | null;
  resolutionDetails: string | null;
  resolutionDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderBookSummary {
  tokenID: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

export interface OrderBookEntry {
  price: string;
  size: string;
  total: string;
}

export interface UserOrder {
  tokenID: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
  orderType: 'GTC' | 'FOK' | 'GTD' | 'FAK';
  expiration?: string;
}

export interface OpenOrder {
  id: string;
  tokenID: string;
  price: string;
  size: string;
  side: 'BUY' | 'SELL';
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  createdAt: string;
  updatedAt: string;
  maker: string;
  taker?: string;
  fee: string;
  nonce: string;
  signature: string;
}

export interface Trade {
  id: string;
  tokenID: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  maker: string;
  taker: string;
  fee: string;
  timestamp: string;
  transactionHash: string;
  blockNumber: number;
}

export interface Position {
  tokenID: string;
  size: string;
  value: string;
  pnl: string;
  realizedPnl: string;
  unrealizedPnl: string;
}

export interface PaginationPayload {
  results: any[];
  next_cursor: string;
  prev_cursor: string;
}

export interface MarketPrice {
  tokenID: string;
  price: string;
  timestamp: string;
}

export interface TickSize {
  tokenID: string;
  tickSize: string;
}

export interface FeeRate {
  tokenID: string;
  feeRateBps: number;
}

export interface BalanceAllowanceResponse {
  balance: string;
  allowance: string;
}

export interface ContractAddresses {
  conditionalTokens: string;
  collateralToken: string;
  polymarketCore: string;
  proxyWallet: string;
}

export interface ClobConfig {
  baseUrl: string;
  chainId: number;
  privateKey: string;
  rpcUrl: string;
}

export interface PolymarketSDKConfig {
  wallet: any; // ethers.Wallet
  chainId?: number;
  rpcUrl?: string;
}

// Параметры для создания ордера
export interface CreateOrderParams {
  tokenID: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
  orderType?: 'GTC' | 'FOK' | 'GTD' | 'FAK';
  expiration?: string;
}

// Параметры для получения ордеров
export interface GetOrdersParams {
  tokenID?: string;
  side?: 'BUY' | 'SELL';
  status?: 'open' | 'filled' | 'cancelled' | 'expired';
  limit?: number;
  cursor?: string;
}

// Параметры для получения сделок
export interface GetTradesParams {
  tokenID?: string;
  side?: 'BUY' | 'SELL';
  limit?: number;
  cursor?: string;
}

// Параметры для получения истории цен
export interface PriceHistoryParams {
  tokenID: string;
  startTime?: string;
  endTime?: string;
  interval?: string;
}