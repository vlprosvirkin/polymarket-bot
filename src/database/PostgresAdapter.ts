/**
 * PostgreSQL Adapter
 * Универсальная точка входа для работы с базой данных
 */

import { Pool, PoolConfig } from 'pg';
import {
    DatabaseConfig,
    QueryResult,
    Transaction,
    // Markets
    MarketRow,
    MarketInsert,
    // Wallets
    WalletRow,
    WalletInsert,
    WalletStats,
    // Trades
    TradeRow,
    TradeInsert,
    TradeSource,
    // Positions
    PositionRow,
    PositionInsert,
    PositionStatus,
    // Orders
    OrderRow,
    OrderInsert,
    OrderStatus,
    // Signals
    SignalRow,
    SignalInsert,
    // AI Analysis
    AIAnalysisRow,
    AIAnalysisInsert,
    // Stats
    BotStatsRow,
    BotStatsInsert,
    // Price History
    PriceHistoryRow,
    PriceHistoryInsert,
} from './types';

export class PostgresAdapter {
    private pool: Pool;
    private isConnected: boolean = false;

    constructor(config?: DatabaseConfig) {
        const poolConfig = this.buildPoolConfig(config);
        this.pool = new Pool(poolConfig);

        this.pool.on('error', (err) => {
            console.error('❌ Unexpected PostgreSQL pool error:', err.message);
        });
    }

    private buildPoolConfig(config?: DatabaseConfig): PoolConfig {
        if (config?.connectionString) {
            return {
                connectionString: config.connectionString,
                ssl: config.ssl,
                max: config.max || 10,
                idleTimeoutMillis: config.idleTimeoutMillis || 30000,
                connectionTimeoutMillis: config.connectionTimeoutMillis || 5000
            };
        }

        if (process.env.DATABASE_URL) {
            return {
                connectionString: process.env.DATABASE_URL,
                ssl: process.env.DATABASE_SSL === 'true'
                    ? { rejectUnauthorized: false }
                    : undefined,
                max: parseInt(process.env.DATABASE_POOL_SIZE || '10'),
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000
            };
        }

        return {
            host: config?.host || process.env.DATABASE_HOST || 'localhost',
            port: config?.port || parseInt(process.env.DATABASE_PORT || '5432'),
            database: config?.database || process.env.DATABASE_NAME || 'polymarket_bot',
            user: config?.user || process.env.DATABASE_USER || 'postgres',
            password: config?.password || process.env.DATABASE_PASSWORD || '',
            ssl: config?.ssl,
            max: config?.max || 10,
            idleTimeoutMillis: config?.idleTimeoutMillis || 30000,
            connectionTimeoutMillis: config?.connectionTimeoutMillis || 5000
        };
    }

    // =====================================================
    // CONNECTION
    // =====================================================

    async connect(): Promise<void> {
        try {
            const client = await this.pool.connect();
            await client.query('SELECT 1');
            client.release();
            this.isConnected = true;
            console.log('✅ PostgreSQL connected');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to connect to PostgreSQL: ${message}`);
        }
    }

    async disconnect(): Promise<void> {
        await this.pool.end();
        this.isConnected = false;
        console.log('✅ PostgreSQL disconnected');
    }

    isReady(): boolean {
        return this.isConnected;
    }

    async query<T = Record<string, unknown>>(
        sql: string,
        params?: unknown[]
    ): Promise<QueryResult<T>> {
        const result = await this.pool.query(sql, params);
        return {
            rows: result.rows as T[],
            rowCount: result.rowCount || 0,
            command: result.command
        };
    }

    async queryOne<T = Record<string, unknown>>(
        sql: string,
        params?: unknown[]
    ): Promise<T | null> {
        const result = await this.query<T>(sql, params);
        return result.rows[0] || null;
    }

    async transaction(): Promise<Transaction> {
        const client = await this.pool.connect();
        let began = false;
        let released = false;

        try {
            await client.query('BEGIN');
            began = true;
        } catch (error) {
            client.release();
            released = true;
            throw error;
        }

        const releaseClient = async () => {
            if (!released) {
                released = true;
                client.release();
            }
        };

        return {
            query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
                try {
                    const result = await client.query(sql, params);
                    return {
                        rows: result.rows as T[],
                        rowCount: result.rowCount || 0,
                        command: result.command
                    };
                } catch (error) {
                    // Автоматический rollback при ошибке
                    if (began) {
                        try {
                            await client.query('ROLLBACK');
                            began = false;
                        } catch {
                            // Игнорируем ошибки rollback
                        }
                    }
                    await releaseClient();
                    throw error;
                }
            },
            commit: async () => {
                try {
                    if (began) {
                        await client.query('COMMIT');
                        began = false;
                    }
                } finally {
                    await releaseClient();
                }
            },
            rollback: async () => {
                try {
                    if (began) {
                        await client.query('ROLLBACK');
                        began = false;
                    }
                } finally {
                    await releaseClient();
                }
            }
        };
    }

    // =====================================================
    // MARKETS
    // =====================================================

    async getMarket(conditionId: string): Promise<MarketRow | null> {
        return this.queryOne<MarketRow>(
            'SELECT * FROM markets WHERE condition_id = $1',
            [conditionId]
        );
    }

    async getActiveMarkets(): Promise<MarketRow[]> {
        const result = await this.query<MarketRow>(
            'SELECT * FROM markets WHERE active = TRUE AND closed = FALSE ORDER BY updated_at DESC'
        );
        return result.rows;
    }

    async upsertMarket(market: MarketInsert): Promise<MarketRow> {
        const sql = `
            INSERT INTO markets (
                condition_id, question, description, market_slug, active, closed, archived,
                accepting_orders, minimum_order_size, minimum_tick_size, neg_risk,
                volume, volume_24hr, liquidity, tokens, category, tags, end_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            ON CONFLICT (condition_id) DO UPDATE SET
                question = EXCLUDED.question,
                active = EXCLUDED.active,
                closed = EXCLUDED.closed,
                volume = EXCLUDED.volume,
                volume_24hr = EXCLUDED.volume_24hr,
                liquidity = EXCLUDED.liquidity,
                tokens = EXCLUDED.tokens,
                updated_at = NOW()
            RETURNING *
        `;
        const result = await this.query<MarketRow>(sql, [
            market.condition_id, market.question, market.description || null,
            market.market_slug, market.active ?? true, market.closed ?? false,
            market.archived ?? false, market.accepting_orders ?? true,
            market.minimum_order_size ?? 0, market.minimum_tick_size ?? 0.01,
            market.neg_risk ?? false, market.volume, market.volume_24hr,
            market.liquidity, JSON.stringify(market.tokens || []),
            market.category, market.tags, market.end_date
        ]);
        return result.rows[0]!;
    }

    // =====================================================
    // WALLETS (Copy Trading)
    // =====================================================

    async getWallets(status?: 'active' | 'paused'): Promise<WalletRow[]> {
        let sql = 'SELECT * FROM wallets';
        const params: unknown[] = [];

        if (status) {
            sql += ' WHERE status = $1';
            params.push(status);
        }

        sql += ' ORDER BY added_at DESC';
        const result = await this.query<WalletRow>(sql, params);
        return result.rows;
    }

    async getWalletByAddress(address: string): Promise<WalletRow | null> {
        return this.queryOne<WalletRow>(
            'SELECT * FROM wallets WHERE LOWER(address) = LOWER($1)',
            [address]
        );
    }

    async addWallet(wallet: WalletInsert): Promise<WalletRow> {
        const sql = `
            INSERT INTO wallets (address, name, status)
            VALUES (LOWER($1), $2, $3)
            RETURNING *
        `;
        const result = await this.query<WalletRow>(sql, [
            wallet.address,
            wallet.name || null,
            wallet.status || 'active'
        ]);
        return result.rows[0]!;
    }

    async updateWalletStatus(address: string, status: 'active' | 'paused'): Promise<boolean> {
        const result = await this.query(
            'UPDATE wallets SET status = $2 WHERE LOWER(address) = LOWER($1)',
            [address, status]
        );
        return result.rowCount > 0;
    }

    async updateWalletStats(address: string, stats: WalletStats): Promise<boolean> {
        const sql = `
            UPDATE wallets SET
                total_trades = $2, winning_trades = $3, total_pnl = $4,
                roi = $5, avg_trade_size = $6, win_rate = $7
            WHERE LOWER(address) = LOWER($1)
        `;
        const result = await this.query(sql, [
            address, stats.total_trades, stats.winning_trades,
            stats.total_pnl, stats.roi, stats.avg_trade_size, stats.win_rate
        ]);
        return result.rowCount > 0;
    }

    async updateWalletLastChecked(addresses: string[]): Promise<void> {
        if (addresses.length === 0) return;
        const placeholders = addresses.map((_, i) => `LOWER($${i + 1})`).join(', ');
        await this.query(
            `UPDATE wallets SET last_checked_at = NOW() WHERE LOWER(address) IN (${placeholders})`,
            addresses
        );
    }

    async removeWallet(address: string): Promise<boolean> {
        const result = await this.query(
            'DELETE FROM wallets WHERE LOWER(address) = LOWER($1)',
            [address]
        );
        return result.rowCount > 0;
    }

    // =====================================================
    // TRADES
    // =====================================================

    async saveTrade(trade: TradeInsert): Promise<TradeRow> {
        const sql = `
            INSERT INTO trades (
                external_id, transaction_hash, source, wallet_address,
                condition_id, market_slug, question, side, outcome, token_id,
                price, size, notional, fee, status, processed, trade_timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (external_id) DO UPDATE SET processed = EXCLUDED.processed
            RETURNING *
        `;
        const result = await this.query<TradeRow>(sql, [
            trade.external_id, trade.transaction_hash, trade.source || 'bot',
            trade.wallet_address, trade.condition_id, trade.market_slug,
            trade.question, trade.side, trade.outcome, trade.token_id,
            trade.price, trade.size, trade.notional, trade.fee || 0,
            trade.status || 'filled', trade.processed ?? false, trade.trade_timestamp
        ]);
        return result.rows[0]!;
    }

    async getTrades(options: {
        source?: TradeSource;
        walletAddress?: string;
        conditionId?: string;
        limit?: number;
    } = {}): Promise<TradeRow[]> {
        let sql = 'SELECT * FROM trades WHERE 1=1';
        const params: unknown[] = [];
        let paramIndex = 1;

        if (options.source) {
            sql += ` AND source = $${paramIndex++}`;
            params.push(options.source);
        }
        if (options.walletAddress) {
            sql += ` AND LOWER(wallet_address) = LOWER($${paramIndex++})`;
            params.push(options.walletAddress);
        }
        if (options.conditionId) {
            sql += ` AND condition_id = $${paramIndex++}`;
            params.push(options.conditionId);
        }

        sql += ' ORDER BY trade_timestamp DESC';

        if (options.limit) {
            sql += ` LIMIT $${paramIndex}`;
            params.push(options.limit);
        }

        const result = await this.query<TradeRow>(sql, params);
        return result.rows;
    }

    async isTradeProcessed(externalId: string): Promise<boolean> {
        const result = await this.queryOne<{ processed: boolean }>(
            'SELECT processed FROM trades WHERE external_id = $1',
            [externalId]
        );
        return result?.processed || false;
    }

    async markTradesProcessed(externalIds: string[]): Promise<void> {
        if (externalIds.length === 0) return;
        const placeholders = externalIds.map((_, i) => `$${i + 1}`).join(', ');
        await this.query(
            `UPDATE trades SET processed = true WHERE external_id IN (${placeholders})`,
            externalIds
        );
    }

    // =====================================================
    // POSITIONS
    // =====================================================

    async savePosition(position: PositionInsert): Promise<PositionRow> {
        // Убеждаемся, что size всегда положительное (абсолютное значение)
        const absoluteSize = Math.abs(position.size);
        
        const sql = `
            INSERT INTO positions (
                token_id, condition_id, market_slug, question, outcome,
                side, position_type, size, average_price, current_price, source, strategy
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `;
        const result = await this.query<PositionRow>(sql, [
            position.token_id, 
            position.condition_id, 
            position.market_slug,
            position.question, 
            position.outcome, 
            position.side,
            position.position_type,
            absoluteSize,  // Всегда положительное значение
            position.average_price, 
            position.current_price,
            position.source || 'bot', 
            position.strategy
        ]);
        return result.rows[0]!;
    }

    async getPositions(status?: PositionStatus, strategy?: string): Promise<PositionRow[]> {
        let sql = 'SELECT * FROM positions WHERE 1=1';
        const params: unknown[] = [];
        let paramIndex = 1;

        if (status) {
            sql += ` AND status = $${paramIndex++}`;
            params.push(status);
        }
        if (strategy) {
            sql += ` AND strategy = $${paramIndex++}`;
            params.push(strategy);
        }

        sql += ' ORDER BY opened_at DESC';
        const result = await this.query<PositionRow>(sql, params);
        return result.rows;
    }

    async getOpenPositions(): Promise<PositionRow[]> {
        return this.getPositions('open');
    }

    async updatePositionPrice(tokenId: string, currentPrice: number, unrealizedPnl: number): Promise<boolean> {
        const result = await this.query(
            `UPDATE positions SET current_price = $2, unrealized_pnl = $3
             WHERE token_id = $1 AND status = 'open'`,
            [tokenId, currentPrice, unrealizedPnl]
        );
        return result.rowCount > 0;
    }

    async closePosition(tokenId: string, realizedPnl: number): Promise<boolean> {
        const result = await this.query(
            `UPDATE positions SET status = 'closed', realized_pnl = $2, closed_at = NOW()
             WHERE token_id = $1 AND status = 'open'`,
            [tokenId, realizedPnl]
        );
        return result.rowCount > 0;
    }

    // =====================================================
    // ORDERS
    // =====================================================

    async saveOrder(order: OrderInsert): Promise<OrderRow> {
        const sql = `
            INSERT INTO orders (
                order_id, token_id, condition_id, market_slug, side, price,
                size, order_type, source, strategy, expires_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `;
        const result = await this.query<OrderRow>(sql, [
            order.order_id, order.token_id, order.condition_id, order.market_slug,
            order.side, order.price, order.size, order.order_type || 'GTC',
            order.source || 'bot', order.strategy, order.expires_at
        ]);
        return result.rows[0]!;
    }

    async updateOrderStatus(orderId: string, status: OrderStatus, filledSize?: number): Promise<boolean> {
        let sql = 'UPDATE orders SET status = $2';
        const params: unknown[] = [orderId, status];

        if (filledSize !== undefined) {
            sql += ', filled_size = $3';
            params.push(filledSize);
        }

        if (status === 'filled') {
            sql += ', filled_at = NOW()';
        }

        sql += ' WHERE order_id = $1';
        const result = await this.query(sql, params);
        return result.rowCount > 0;
    }

    async getPendingOrders(): Promise<OrderRow[]> {
        const result = await this.query<OrderRow>(
            `SELECT * FROM orders WHERE status IN ('pending', 'partial') ORDER BY created_at DESC`
        );
        return result.rows;
    }

    // =====================================================
    // SIGNALS
    // =====================================================

    async saveSignal(signal: SignalInsert): Promise<SignalRow> {
        const sql = `
            INSERT INTO signals (
                source, wallet_address, wallet_name, strategy, condition_id,
                market_slug, question, token_id, action, side, outcome,
                confidence, suggested_price, suggested_size, max_price, reasons, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *
        `;
        const result = await this.query<SignalRow>(sql, [
            signal.source, signal.wallet_address, signal.wallet_name, signal.strategy,
            signal.condition_id, signal.market_slug, signal.question, signal.token_id,
            signal.action, signal.side, signal.outcome, signal.confidence,
            signal.suggested_price, signal.suggested_size, signal.max_price,
            signal.reasons, signal.metadata ? JSON.stringify(signal.metadata) : null
        ]);
        return result.rows[0]!;
    }

    async getSignals(options: {
        source?: string;
        action?: string;
        executed?: boolean;
        limit?: number;
    } = {}): Promise<SignalRow[]> {
        let sql = 'SELECT * FROM signals WHERE 1=1';
        const params: unknown[] = [];
        let paramIndex = 1;

        if (options.source) {
            sql += ` AND source = $${paramIndex++}`;
            params.push(options.source);
        }
        if (options.action) {
            sql += ` AND action = $${paramIndex++}`;
            params.push(options.action);
        }
        if (options.executed !== undefined) {
            sql += ` AND executed = $${paramIndex++}`;
            params.push(options.executed);
        }

        sql += ' ORDER BY created_at DESC';

        if (options.limit) {
            sql += ` LIMIT $${paramIndex}`;
            params.push(options.limit);
        }

        const result = await this.query<SignalRow>(sql, params);
        return result.rows;
    }

    async markSignalExecuted(signalId: string, orderId?: string): Promise<boolean> {
        const result = await this.query(
            `UPDATE signals SET executed = true, executed_at = NOW(), order_id = $2
             WHERE signal_id = $1`,
            [signalId, orderId]
        );
        return result.rowCount > 0;
    }

    // =====================================================
    // AI ANALYSIS
    // =====================================================

    async saveAIAnalysis(analysis: AIAnalysisInsert): Promise<AIAnalysisRow> {
        const sql = `
            INSERT INTO ai_analysis (
                condition_id, market_slug, question, ai_probability, market_price,
                edge, attractiveness, risk_level, reasoning, news_summary,
                key_factors, model, tokens_used, cost_usd, expires_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (condition_id) DO UPDATE SET
                ai_probability = EXCLUDED.ai_probability,
                market_price = EXCLUDED.market_price,
                edge = EXCLUDED.edge,
                attractiveness = EXCLUDED.attractiveness,
                risk_level = EXCLUDED.risk_level,
                reasoning = EXCLUDED.reasoning,
                news_summary = EXCLUDED.news_summary,
                key_factors = EXCLUDED.key_factors,
                model = EXCLUDED.model,
                tokens_used = EXCLUDED.tokens_used,
                cost_usd = EXCLUDED.cost_usd,
                analyzed_at = NOW(),
                expires_at = EXCLUDED.expires_at
            RETURNING *
        `;
        const result = await this.query<AIAnalysisRow>(sql, [
            analysis.condition_id, analysis.market_slug, analysis.question,
            analysis.ai_probability, analysis.market_price, analysis.edge,
            analysis.attractiveness, analysis.risk_level, analysis.reasoning,
            analysis.news_summary, analysis.key_factors, analysis.model,
            analysis.tokens_used, analysis.cost_usd, analysis.expires_at
        ]);
        return result.rows[0]!;
    }

    async getCachedAIAnalysis(conditionId: string): Promise<AIAnalysisRow | null> {
        return this.queryOne<AIAnalysisRow>(
            'SELECT * FROM ai_analysis WHERE condition_id = $1 AND expires_at > NOW()',
            [conditionId]
        );
    }

    async getTopAIAnalysis(minAttractiveness: number = 50, limit: number = 10): Promise<AIAnalysisRow[]> {
        const result = await this.query<AIAnalysisRow>(
            `SELECT * FROM ai_analysis
             WHERE expires_at > NOW() AND attractiveness >= $1
             ORDER BY attractiveness DESC LIMIT $2`,
            [minAttractiveness, limit]
        );
        return result.rows;
    }

    async cleanExpiredAIAnalysis(): Promise<number> {
        const result = await this.query('DELETE FROM ai_analysis WHERE expires_at < NOW()');
        return result.rowCount;
    }

    // =====================================================
    // BOT STATS
    // =====================================================

    async updateBotStats(stats: BotStatsInsert): Promise<BotStatsRow> {
        const sql = `
            INSERT INTO bot_stats (
                date, strategy, total_trades, winning_trades, losing_trades,
                total_volume, total_pnl, total_fees, ai_calls, ai_cost_usd
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (date, strategy) DO UPDATE SET
                total_trades = bot_stats.total_trades + EXCLUDED.total_trades,
                winning_trades = bot_stats.winning_trades + EXCLUDED.winning_trades,
                losing_trades = bot_stats.losing_trades + EXCLUDED.losing_trades,
                total_volume = bot_stats.total_volume + EXCLUDED.total_volume,
                total_pnl = bot_stats.total_pnl + EXCLUDED.total_pnl,
                total_fees = bot_stats.total_fees + EXCLUDED.total_fees,
                ai_calls = bot_stats.ai_calls + EXCLUDED.ai_calls,
                ai_cost_usd = bot_stats.ai_cost_usd + EXCLUDED.ai_cost_usd
            RETURNING *
        `;
        const result = await this.query<BotStatsRow>(sql, [
            stats.date, stats.strategy, stats.total_trades || 0,
            stats.winning_trades || 0, stats.losing_trades || 0,
            stats.total_volume || 0, stats.total_pnl || 0, stats.total_fees || 0,
            stats.ai_calls || 0, stats.ai_cost_usd || 0
        ]);
        return result.rows[0]!;
    }

    async getBotStats(days: number = 30, strategy?: string): Promise<BotStatsRow[]> {
        let sql = `SELECT * FROM bot_stats WHERE date >= CURRENT_DATE - INTERVAL '${days} days'`;
        const params: unknown[] = [];

        if (strategy) {
            sql += ' AND strategy = $1';
            params.push(strategy);
        }

        sql += ' ORDER BY date DESC';
        const result = await this.query<BotStatsRow>(sql, params);
        return result.rows;
    }

    // =====================================================
    // PRICE HISTORY
    // =====================================================

    async savePriceHistory(price: PriceHistoryInsert): Promise<PriceHistoryRow> {
        const sql = `
            INSERT INTO price_history (condition_id, token_id, price, bid, ask, spread)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        const result = await this.query<PriceHistoryRow>(sql, [
            price.condition_id, price.token_id, price.price,
            price.bid, price.ask, price.spread
        ]);
        return result.rows[0]!;
    }

    async getPriceHistory(conditionId: string, hours: number = 24): Promise<PriceHistoryRow[]> {
        const result = await this.query<PriceHistoryRow>(
            `SELECT * FROM price_history
             WHERE condition_id = $1 AND recorded_at > NOW() - INTERVAL '${hours} hours'
             ORDER BY recorded_at DESC`,
            [conditionId]
        );
        return result.rows;
    }

    // =====================================================
    // UTILITY
    // =====================================================

    async healthCheck(): Promise<boolean> {
        try {
            await this.query('SELECT 1');
            return true;
        } catch {
            return false;
        }
    }

    getPoolStats(): { total: number; idle: number; waiting: number } {
        return {
            total: this.pool.totalCount,
            idle: this.pool.idleCount,
            waiting: this.pool.waitingCount
        };
    }
}

// Singleton
let instance: PostgresAdapter | null = null;

export function getDatabase(config?: DatabaseConfig): PostgresAdapter {
    if (!instance) {
        instance = new PostgresAdapter(config);
    }
    return instance;
}

export async function initDatabase(config?: DatabaseConfig): Promise<PostgresAdapter> {
    const db = getDatabase(config);
    await db.connect();
    return db;
}
