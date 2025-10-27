// Константы для работы с Polymarket
export const POLYMARKET_CONSTANTS = {
  // Адреса контрактов на Polygon
  CONDITIONAL_TOKENS: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
  COLLATERAL_TOKEN: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
  
  // Chain IDs
  POLYGON_CHAIN_ID: 137,
  ETHEREUM_CHAIN_ID: 1,
  
  // Gas настройки
  DEFAULT_GAS_LIMIT: 500000,
  DEFAULT_GAS_PRICE_GWEI: 30,
  
  // Торговые настройки
  MAX_SLIPPAGE_PERCENT: 5,
  MIN_BALANCE_USDC: 10, // $10 USDC
  
  // RPC URLs
  POLYGON_RPC: 'https://polygon-rpc.com',
  POLYGON_RPC_ALT: 'https://rpc-mainnet.maticvigil.com',
  
  // API endpoints
  POLYMARKET_API: 'https://gamma-api.polymarket.com',
  POLYMARKET_GRAPH: 'https://api.thegraph.com/subgraphs/name/polymarket/polymarket'
};

// Типы событий для логирования
export const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
} as const;

export type LogLevel = typeof LOG_LEVELS[keyof typeof LOG_LEVELS];

// Статусы транзакций
export const TRANSACTION_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED'
} as const;

export type TransactionStatus = typeof TRANSACTION_STATUS[keyof typeof TRANSACTION_STATUS];
