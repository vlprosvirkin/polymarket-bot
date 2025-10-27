export interface Market {
  id: string;
  question: string;
  description: string;
  endDate: Date;
  outcomes: string[];
  volume: string;
  liquidity: string;
  isResolved: boolean;
  resolution: string | null;
}

export interface Position {
  marketId: string;
  outcome: string;
  amount: string;
  value: string;
}

export interface TradeParams {
  marketId: string;
  outcome: string;
  amount: string;
  price: string;
  isBuy: boolean;
}

export interface MarketData {
  question: string;
  description: string;
  endDate: Date;
  outcomes: string[];
  volume: string;
  liquidity: string;
  isResolved: boolean;
  resolution: string | null;
}

export interface ContractAddresses {
  conditionalTokens: string;
  collateralToken: string;
  polymarketCore: string;
}
