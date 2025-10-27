// Константы для работы с Polymarket на основе официальной документации

export const POLYMARKET_CONSTANTS = {
  // Адреса контрактов на Polygon (актуальные на 2024)
  CONDITIONAL_TOKENS: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
  COLLATERAL_TOKEN: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
  PROXY_WALLET: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045', // Polymarket Core
  
  // Chain IDs
  POLYGON_CHAIN_ID: 137,
  ETHEREUM_CHAIN_ID: 1,
  
  // API Endpoints
  CLOB_API_URL: 'https://clob.polymarket.com',
  GAMMA_API_URL: 'https://gamma-api.polymarket.com',
  DATA_API_URL: 'https://data-api.polymarket.com',
  
  // Gas настройки
  DEFAULT_GAS_LIMIT: 500000,
  DEFAULT_GAS_PRICE_GWEI: 30,
  
  // Торговые настройки
  MAX_SLIPPAGE_PERCENT: 5,
  MIN_BALANCE_USDC: 10, // $10 USDC
  DEFAULT_ORDER_EXPIRATION: 86400, // 24 часа в секундах
  
  // RPC URLs
  POLYGON_RPC: 'https://polygon-rpc.com',
  POLYGON_RPC_ALT: 'https://rpc-mainnet.maticvigil.com',
  POLYGON_RPC_QUICKNODE: 'https://polygon-mainnet.g.alchemy.com/v2/demo',
  
  // Лимиты API
  API_RATE_LIMIT: {
    REQUESTS_PER_MINUTE: 100,
    REQUESTS_PER_HOUR: 1000,
    REQUESTS_PER_DAY: 10000
  },
  
  // Статусы ордеров
  ORDER_STATUS: {
    OPEN: 'open',
    FILLED: 'filled',
    CANCELLED: 'cancelled',
    EXPIRED: 'expired'
  },
  
  // Стороны ордеров
  ORDER_SIDE: {
    BUY: 'buy',
    SELL: 'sell'
  }
} as const;

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

// Конфигурация по умолчанию для CLOB
export const DEFAULT_CLOB_CONFIG = {
  baseUrl: POLYMARKET_CONSTANTS.CLOB_API_URL,
  chainId: POLYMARKET_CONSTANTS.POLYGON_CHAIN_ID,
  timeout: 30000, // 30 секунд
  retries: 3
} as const;
