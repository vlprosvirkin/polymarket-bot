/**
 * Конфигурация Copy Trading
 */

export const COPY_TRADING_CONFIG = {
    // Интервал проверки (в минутах)
    checkIntervalMinutes: 5,

    // Окно поиска сделок (с запасом, в минутах)
    tradeWindowMinutes: 10,

    // Скоринг
    scoring: {
        minNotionalUsd: 50,           // Игнорировать сделки меньше $50
        minWalletRoi: 0.05,           // Мин ROI кошелька 5%
        minWalletWinRate: 0.50,       // Мин винрейт 50%
    },

    // Параметры копирования
    copy: {
        copyRatio: 0.1,               // Копируем 10% от размера whale
        maxTradeSize: 100,            // Макс $100 за сделку
        minTradeSize: 5,              // Мин $5 за сделку
        maxSlippagePercent: 0.05,     // Макс 5% slippage
    },

    // API endpoints
    api: {
        // Polymarket Data API для получения сделок
        tradesUrl: 'https://data-api.polymarket.com/trades',
    },

    // Пути к файлам данных
    paths: {
        dataDir: 'data',
        walletsFile: 'wallets.json',
        processedTradesFile: 'processed-trades.json',
        signalsFile: 'signals.json',
    }
};

export type CopyTradingConfig = typeof COPY_TRADING_CONFIG;
