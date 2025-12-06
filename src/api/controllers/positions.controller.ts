/**
 * Контроллер для работы с позициями и ордерами
 */

import { Request, Response } from 'express';
import { ClobClient, AssetType, Side, OrderType, TickSize } from '@polymarket/clob-client';
import { getErrorMessage, ErrorResponse } from '../../types/errors';
import { getDatabase, PostgresAdapter } from '../../database';
import { PositionsService } from '../../services/PositionsService';
import { Market, OrderResult } from '../../types/market';

export class PositionsController {
    private db: PostgresAdapter | null = null;
    private positionsService: PositionsService;

    constructor(private client: ClobClient) {
        if (process.env.DATABASE_URL) {
            try {
                this.db = getDatabase();
            } catch {
                this.db = null;
            }
        }
        this.positionsService = new PositionsService(client);
    }

    /**
     * GET /api/positions/orders
     * Получить все открытые ордера
     */
    async getOpenOrders(_req: Request, res: Response) {
        try {
            const openOrders = await this.client.getOpenOrders();

            const formatted = openOrders.map(order => ({
                id: order.id,
                market: order.market,
                outcome: order.outcome,
                side: order.side,
                price: parseFloat(order.price),
                pricePercent: `${(parseFloat(order.price) * 100).toFixed(2)}%`,
                size: parseFloat(order.original_size),
                sizeMatched: parseFloat(order.size_matched),
                created: order.created_at,
                status: parseFloat(order.size_matched) > 0 ? 'partially_filled' : 'open'
            }));

            res.json({
                success: true,
                count: formatted.length,
                orders: formatted
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/positions/trades
     * Получить историю сделок
     */
    async getTrades(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 20;
            const trades = await this.client.getTrades({});

            const formatted = trades.slice(0, limit).map(trade => ({
                id: trade.id,
                market: trade.market,
                outcome: trade.outcome,
                side: trade.side,
                price: parseFloat(trade.price),
                pricePercent: `${(parseFloat(trade.price) * 100).toFixed(2)}%`,
                size: parseFloat(trade.size),
                feeRateBps: parseFloat(trade.fee_rate_bps),
                feePercent: `${(parseFloat(trade.fee_rate_bps) / 100).toFixed(2)}%`,
                timestamp: trade.match_time,
                date: new Date(trade.match_time).toISOString()
            }));

            res.json({
                success: true,
                count: formatted.length,
                trades: formatted
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/positions/active
     * Получить активные позиции (рассчитанные из сделок)
     */
    async getActivePositions(_req: Request, res: Response) {
        try {
            const trades = await this.client.getTrades({});

            // Группируем сделки по asset_id
            const positionMap = new Map<string, {
                market: string;
                outcome: string;
                asset_id: string;
                buySize: number;
                sellSize: number;
                totalCost: number;
                trades: number;
            }>();

            for (const trade of trades) {
                const key = trade.asset_id;
                const existing = positionMap.get(key) || {
                    market: trade.market,
                    outcome: trade.outcome,
                    asset_id: trade.asset_id,
                    buySize: 0,
                    sellSize: 0,
                    totalCost: 0,
                    trades: 0
                };

                const size = parseFloat(trade.size);
                const price = parseFloat(trade.price);

                if (trade.side === Side.BUY) {
                    existing.buySize += size;
                    existing.totalCost += size * price;
                } else if (trade.side === Side.SELL) {
                    existing.sellSize += size;
                    existing.totalCost -= size * price;
                }

                existing.trades++;
                positionMap.set(key, existing);
            }

            // Фильтруем только активные позиции
            const positions = Array.from(positionMap.values())
                .filter(p => Math.abs(p.buySize - p.sellSize) > 0.01)
                .map(pos => {
                    const netSize = pos.buySize - pos.sellSize;
                    const avgPrice = pos.totalCost / pos.buySize;

                    return {
                        market: pos.market,
                        outcome: pos.outcome,
                        tokenId: pos.asset_id,
                        netSize: parseFloat(netSize.toFixed(2)),
                        buySize: parseFloat(pos.buySize.toFixed(2)),
                        sellSize: parseFloat(pos.sellSize.toFixed(2)),
                        avgPrice: parseFloat((avgPrice * 100).toFixed(2)),
                        totalCost: parseFloat(pos.totalCost.toFixed(2)),
                        trades: pos.trades,
                        status: netSize > 0 ? 'long' : 'short'
                    };
                });

            res.json({
                success: true,
                count: positions.length,
                positions
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/positions/balance
     * Получить USDC баланс и allowance
     */
    async getBalance(_req: Request, res: Response) {
        try {
            const balanceResponse = await this.client.getBalanceAllowance({
                asset_type: AssetType.COLLATERAL
            });

            const balance = parseFloat(balanceResponse.balance) / 1e6; // USDC 6 decimals
            const allowance = parseFloat(balanceResponse.allowance) / 1e6;

            res.json({
                success: true,
                balance: {
                    usdc: parseFloat(balance.toFixed(2)),
                    allowance: parseFloat(allowance.toFixed(2)),
                    raw: {
                        balance: balanceResponse.balance,
                        allowance: balanceResponse.allowance
                    }
                }
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/positions/summary
     * Получить полную сводку (все данные разом)
     */
    async getSummary(_req: Request, res: Response) {
        try {
            const [openOrders, trades, balanceResponse] = await Promise.all([
                this.client.getOpenOrders(),
                this.client.getTrades({}),
                this.client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL })
            ]);

            // Рассчитываем активные позиции
            interface PositionData {
                market: string;
                outcome: string;
                buySize: number;
                sellSize: number;
                totalCost: number;
            }
            const positionMap = new Map<string, PositionData>();
            for (const trade of trades) {
                const key = trade.asset_id;
                const existing = positionMap.get(key) || {
                    market: trade.market,
                    outcome: trade.outcome,
                    buySize: 0,
                    sellSize: 0,
                    totalCost: 0
                };

                const size = parseFloat(trade.size);
                const price = parseFloat(trade.price);

                if (trade.side === Side.BUY) {
                    existing.buySize += size;
                    existing.totalCost += size * price;
                } else if (trade.side === Side.SELL) {
                    existing.sellSize += size;
                    existing.totalCost -= size * price;
                }

                positionMap.set(key, existing);
            }

            const activePositions = Array.from(positionMap.values())
                .filter(p => Math.abs(p.buySize - p.sellSize) > 0.01)
                .map(pos => ({
                    market: pos.market,
                    outcome: pos.outcome,
                    netSize: parseFloat((pos.buySize - pos.sellSize).toFixed(2)),
                    totalCost: parseFloat(pos.totalCost.toFixed(2))
                }));

            const balance = parseFloat(balanceResponse.balance) / 1e6;

            res.json({
                success: true,
                summary: {
                    openOrders: openOrders.length,
                    activePositions: activePositions.length,
                    recentTrades: trades.length,
                    balance: parseFloat(balance.toFixed(2)),
                    totalExposure: parseFloat(
                        activePositions.reduce((sum, p) => sum + Math.abs(p.totalCost), 0).toFixed(2)
                    )
                },
                details: {
                    orders: openOrders.slice(0, 5).map(o => ({
                        market: o.market,
                        side: o.side,
                        price: `${(parseFloat(o.price) * 100).toFixed(2)}%`
                    })),
                    positions: activePositions
                }
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }

    /**
     * DELETE /api/positions/orders/:orderId
     * Отменить ордер
     */
    async cancelOrder(req: Request, res: Response) {
        try {
            const { orderId } = req.params;

            if (!orderId) {
                res.status(400).json({
                    success: false,
                    error: 'Order ID is required'
                });
                return;
            }

            await this.client.cancelOrder({ orderID: orderId });

            res.json({
                success: true,
                message: `Order ${orderId} cancelled`
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }

    /**
     * DELETE /api/positions/orders
     * Отменить все ордера
     */
    async cancelAllOrders(_req: Request, res: Response) {
        try {
            const openOrders = await this.client.getOpenOrders();

            const results = await Promise.allSettled(
                openOrders.map(order => this.client.cancelOrder({ orderID: order.id }))
            );

            const cancelled = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;

            res.json({
                success: true,
                message: `Cancelled ${cancelled} orders, ${failed} failed`,
                cancelled,
                failed,
                total: openOrders.length
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/positions/db/orders
     * Получить ордера из БД
     */
    async getDbOrders(req: Request, res: Response) {
        if (!this.db || !this.db.isReady()) {
            res.status(503).json({
                success: false,
                error: 'Database not available'
            });
            return;
        }

        try {
            const status = req.query.status as string | undefined;
            let orders;
            if (status) {
                const result = await this.db.query(`SELECT * FROM orders WHERE status = $1 ORDER BY created_at DESC LIMIT 100`, [status]);
                orders = result.rows;
            } else {
                orders = await this.db.getPendingOrders();
            }

            res.json({
                success: true,
                count: orders.length,
                orders
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/positions/db/trades
     * Получить сделки из БД
     */
    async getDbTrades(req: Request, res: Response) {
        if (!this.db || !this.db.isReady()) {
            res.status(503).json({
                success: false,
                error: 'Database not available'
            });
            return;
        }

        try {
            const limit = parseInt(req.query.limit as string) || 50;
            const source = req.query.source as 'bot' | 'copy' | 'manual' | undefined;

            const trades = await this.db.getTrades({ source, limit });

            res.json({
                success: true,
                count: trades.length,
                trades
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/positions/db/positions
     * Получить позиции из БД
     */
    async getDbPositions(req: Request, res: Response) {
        if (!this.db || !this.db.isReady()) {
            res.status(503).json({
                success: false,
                error: 'Database not available'
            });
            return;
        }

        try {
            const status = req.query.status as 'open' | 'closed' | 'partial' | undefined;
            const strategy = req.query.strategy as string | undefined;

            const positions = await this.db.getPositions(status, strategy);

            res.json({
                success: true,
                count: positions.length,
                positions
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/positions/db/signals
     * Получить сигналы из БД
     */
    async getDbSignals(req: Request, res: Response) {
        if (!this.db || !this.db.isReady()) {
            res.status(503).json({
                success: false,
                error: 'Database not available'
            });
            return;
        }

        try {
            const limit = parseInt(req.query.limit as string) || 50;
            const source = req.query.source as string | undefined;
            const action = req.query.action as string | undefined;

            const signals = await this.db.getSignals({ source, action, limit });

            res.json({
                success: true,
                count: signals.length,
                signals
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/positions/db/stats
     * Получить статистику бота
     */
    async getDbStats(req: Request, res: Response) {
        if (!this.db || !this.db.isReady()) {
            res.status(503).json({
                success: false,
                error: 'Database not available'
            });
            return;
        }

        try {
            const days = parseInt(req.query.days as string) || 30;
            const strategy = req.query.strategy as string | undefined;

            const stats = await this.db.getBotStats(days, strategy);

            // Агрегируем статистику
            const totals = stats.reduce((acc, s) => ({
                totalTrades: acc.totalTrades + s.total_trades,
                winningTrades: acc.winningTrades + s.winning_trades,
                losingTrades: acc.losingTrades + s.losing_trades,
                totalVolume: acc.totalVolume + Number(s.total_volume),
                totalPnl: acc.totalPnl + Number(s.total_pnl),
                aiCalls: acc.aiCalls + s.ai_calls,
                aiCostUsd: acc.aiCostUsd + Number(s.ai_cost_usd)
            }), {
                totalTrades: 0,
                winningTrades: 0,
                losingTrades: 0,
                totalVolume: 0,
                totalPnl: 0,
                aiCalls: 0,
                aiCostUsd: 0
            });

            res.json({
                success: true,
                period: `${days} days`,
                totals,
                winRate: totals.totalTrades > 0
                    ? `${((totals.winningTrades / totals.totalTrades) * 100).toFixed(2)}%`
                    : '0%',
                dailyStats: stats
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/positions/status
     * Получить полную информацию о позициях, ставках и рынках
     * Включает информацию о разрешении рынков и результатах позиций
     * 
     * Query параметры:
     * - positionType: 'LONG' | 'SHORT' - фильтр по типу позиции
     * - result: 'win' | 'loss' | 'pending' - фильтр по результату
     * - resolved: 'true' | 'false' - фильтр по разрешению рынка
     */
    async getPositionsStatus(req: Request, res: Response) {
        try {
            const summary = await this.positionsService.getWalletPositions();
            
            // Применяем фильтры если указаны
            let filteredPositions = summary.positions;
            
            const positionType = req.query.positionType as 'LONG' | 'SHORT' | undefined;
            if (positionType) {
                filteredPositions = filteredPositions.filter(p => p.positionType === positionType);
            }
            
            const result = req.query.result as 'win' | 'loss' | 'pending' | undefined;
            if (result) {
                filteredPositions = filteredPositions.filter(p => p.result === result);
            }
            
            const resolved = req.query.resolved as string | undefined;
            if (resolved === 'true') {
                filteredPositions = filteredPositions.filter(p => p.isResolved);
            } else if (resolved === 'false') {
                filteredPositions = filteredPositions.filter(p => !p.isResolved);
            }
            
            // Пересчитываем summary для отфильтрованных позиций
            const filteredSummary = this.positionsService.calculateSummary(filteredPositions);

            res.json({
                success: true,
                positions: filteredPositions,
                markets: summary.markets,
                summary: filteredSummary,
                filters: {
                    positionType: positionType || null,
                    result: result || null,
                    resolved: resolved || null,
                }
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/positions/status/:tokenId
     * Получить информацию о конкретной позиции по токену
     */
    async getPositionStatus(req: Request, res: Response) {
        try {
            const { tokenId } = req.params;

            if (!tokenId) {
                res.status(400).json({
                    success: false,
                    error: 'Token ID is required'
                });
                return;
            }

            const position = await this.positionsService.getPositionByTokenId(tokenId);

            if (!position) {
                res.status(404).json({
                    success: false,
                    error: 'Position not found'
                });
                return;
            }

            res.json({
                success: true,
                position
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/positions/db/health
     * Проверить состояние БД
     */
    async getDbHealth(_req: Request, res: Response) {
        if (!this.db) {
            res.json({
                success: true,
                database: {
                    configured: false,
                    connected: false,
                    message: 'Database not configured (DATABASE_URL missing)'
                }
            });
            return;
        }

        try {
            const isHealthy = await this.db.healthCheck();
            const poolStats = this.db.getPoolStats();

            res.json({
                success: true,
                database: {
                    configured: true,
                    connected: isHealthy,
                    pool: poolStats
                }
            });
        } catch (error: unknown) {
            res.json({
                success: true,
                database: {
                    configured: true,
                    connected: false,
                    error: getErrorMessage(error)
                }
            });
        }
    }

    /**
     * POST /api/positions/create-order
     * Создать ордер на рынке
     */
    async createOrder(req: Request, res: Response) {
        try {
            const body = req.body as {
                condition_id: string;
                outcome: 'Yes' | 'No';
                side: 'BUY' | 'SELL';
                size: number;
                price?: number;
                orderType?: 'LIMIT' | 'MARKET';
            };

            // Валидация
            if (!body.condition_id || !body.outcome || !body.side || !body.size) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: condition_id, outcome, side, size'
                });
            }

            if (body.size <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Size must be greater than 0'
                });
            }

            if (body.price !== undefined && (body.price < 0 || body.price > 1)) {
                return res.status(400).json({
                    success: false,
                    error: 'Price must be between 0 and 1'
                });
            }

            // Получаем рынок для получения token_id
            const market = await this.client.getMarket(body.condition_id) as Market;
            if (!market || !market.tokens) {
                return res.status(404).json({
                    success: false,
                    error: 'Market not found'
                });
            }

            const token = market.tokens.find((t) => t.outcome === body.outcome);
            if (!token) {
                return res.status(400).json({
                    success: false,
                    error: `Token with outcome '${body.outcome}' not found in market`
                });
            }

            // Определяем цену
            let orderPrice: string;
            if (body.price !== undefined) {
                orderPrice = body.price.toString();
            } else {
                // Используем реальную рыночную цену (midpoint) для актуальности
                try {
                    const midpoint = await this.client.getMidpoint(token.token_id);
                    orderPrice = midpoint;
                } catch (error) {
                    // Fallback на цену токена если midpoint недоступен
                    orderPrice = token.price.toString();
                }
            }

            // Определяем side для CLOB API
            const side: Side = body.side === 'BUY' ? Side.BUY : Side.SELL;

            // Определяем order type
            // createAndPostOrder поддерживает только GTC и GTD
            // Для MARKET ордеров нужно использовать другой метод (postOrder с FOK)
            // Пока возвращаем ошибку для MARKET, предлагая использовать LIMIT с текущей ценой
            if (body.orderType === 'MARKET') {
                return res.status(400).json({
                    success: false,
                    error: 'MARKET orders are not supported via this endpoint. Use LIMIT orders with current market price instead. Set orderType to "LIMIT" and omit price to use current market price.'
                });
            }
            const orderType = OrderType.GTC;

            // Получаем tickSize из рынка (обязательно)
            if (!market.minimum_tick_size) {
                return res.status(400).json({
                    success: false,
                    error: 'Market minimum_tick_size is required but not available'
                });
            }
            const tickSize: TickSize = market.minimum_tick_size.toString() as TickSize;

            // Создаем ордер (3 параметра: order params, options, orderType)
            const orderResult = await this.client.createAndPostOrder(
                {
                    tokenID: token.token_id,
                    side,
                    price: parseFloat(orderPrice),
                    size: body.size
                },
                {
                    tickSize: tickSize,
                    negRisk: market.neg_risk || false
                },
                orderType
            ) as OrderResult;

            if (!orderResult || !orderResult.orderID) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to create order'
                });
            }

            // Получаем детали созданного ордера
            const openOrders = await this.client.getOpenOrders();
            const createdOrder = openOrders.find(o => o.id === orderResult.orderID);

            return res.json({
                success: true,
                order: {
                    id: orderResult.orderID,
                    condition_id: body.condition_id,
                    outcome: body.outcome,
                    side: body.side,
                    price: parseFloat(orderPrice),
                    pricePercent: `${(parseFloat(orderPrice) * 100).toFixed(2)}%`,
                    size: body.size,
                    orderType: body.orderType || 'LIMIT',
                    status: 'open',
                    created_at: new Date().toISOString(),
                    ...(createdOrder ? {
                        size_matched: parseFloat(createdOrder.size_matched),
                        size_remaining: parseFloat(createdOrder.original_size) - parseFloat(createdOrder.size_matched)
                    } : {})
                }
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            return res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/positions/orders/:orderId
     * Получить статус конкретного ордера
     */
    async getOrderStatus(req: Request, res: Response) {
        try {
            const { orderId } = req.params;

            // Получаем открытые ордера
            const openOrders = await this.client.getOpenOrders();
            const order = openOrders.find(o => o.id === orderId);

            if (!order) {
                // Проверяем в истории сделок (возможно, ордер уже выполнен)
                const trades = await this.client.getTrades({});
                const trade = trades.find((t: { order_id?: string; id: string }) => 
                    t.order_id === orderId || t.id === orderId
                );

                if (trade) {
                    // Trade из clob-client может иметь timestamp (number) или match_time (string)
                    const tradeAny = trade as unknown as { timestamp?: number; match_time?: string; size: string; price: string };
                    const tradeTimestamp = tradeAny.timestamp 
                        ? new Date(tradeAny.timestamp * 1000).toISOString()
                        : tradeAny.match_time || new Date().toISOString();
                    
                    return res.json({
                        success: true,
                        order: {
                            id: orderId,
                            status: 'filled',
                            filled_size: parseFloat(tradeAny.size),
                            filled_price: parseFloat(tradeAny.price),
                            created_at: tradeTimestamp,
                            filled_at: tradeTimestamp
                        }
                    });
                }

                return res.status(404).json({
                    success: false,
                    error: 'Order not found'
                });
            }

            return res.json({
                success: true,
                order: {
                    id: order.id,
                    condition_id: order.market,
                    outcome: order.outcome,
                    side: order.side,
                    price: parseFloat(order.price),
                    pricePercent: `${(parseFloat(order.price) * 100).toFixed(2)}%`,
                    size: parseFloat(order.original_size),
                    size_matched: parseFloat(order.size_matched),
                    size_remaining: parseFloat(order.original_size) - parseFloat(order.size_matched),
                    status: parseFloat(order.size_matched) > 0 ? 'partially_filled' : 'open',
                    created_at: typeof order.created_at === 'number' 
                        ? new Date(order.created_at * 1000).toISOString() 
                        : order.created_at
                }
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            return res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/positions/orders/all
     * Получить список всех ордеров (открытые + заполненные)
     */
    async getAllOrders(req: Request, res: Response) {
        try {
            const status = req.query.status as string; // 'open', 'filled', 'all'
            const limit = parseInt(req.query.limit as string) || 50;

            // Получаем открытые ордера
            const openOrders = await this.client.getOpenOrders();

            // Получаем историю сделок для заполненных ордеров
            const trades = await this.client.getTrades({});
            const filledOrders = trades.slice(0, limit).map((trade) => {
                // Trade из clob-client может иметь timestamp (number) или match_time (string)
                const tradeAny = trade as unknown as { order_id?: string; id: string; market: string; outcome: string; side: string; price: string; size: string; timestamp?: number; match_time?: string };
                const tradeTimestamp = tradeAny.timestamp 
                    ? new Date(tradeAny.timestamp * 1000).toISOString()
                    : tradeAny.match_time || new Date().toISOString();
                
                return {
                    id: tradeAny.order_id || tradeAny.id,
                    condition_id: tradeAny.market,
                    outcome: tradeAny.outcome,
                    side: tradeAny.side,
                    price: parseFloat(tradeAny.price),
                    pricePercent: `${(parseFloat(tradeAny.price) * 100).toFixed(2)}%`,
                    size: parseFloat(tradeAny.size),
                    status: 'filled',
                    filled_at: tradeTimestamp,
                    created_at: tradeTimestamp
                };
            });

            let allOrders: Array<{
                id: string;
                condition_id: string;
                outcome: string;
                side: string;
                price: number;
                pricePercent: string;
                size: number;
                status: string;
                created_at?: string;
                filled_at?: string;
            }> = [];

            if (status === 'open' || status === 'all' || !status) {
                const formattedOpen = openOrders.map(order => ({
                    id: order.id,
                    condition_id: order.market,
                    outcome: order.outcome,
                    side: order.side,
                    price: parseFloat(order.price),
                    pricePercent: `${(parseFloat(order.price) * 100).toFixed(2)}%`,
                    size: parseFloat(order.original_size),
                    size_matched: parseFloat(order.size_matched),
                    status: parseFloat(order.size_matched) > 0 ? 'partially_filled' : 'open',
                    created_at: typeof order.created_at === 'number' 
                        ? new Date(order.created_at * 1000).toISOString() 
                        : order.created_at
                }));
                allOrders.push(...formattedOpen);
            }

            if (status === 'filled' || status === 'all' || !status) {
                allOrders.push(...filledOrders);
            }

            // Убираем дубликаты и сортируем
            const uniqueOrders = Array.from(
                new Map(allOrders.map(o => [o.id, o])).values()
            ).sort((a, b) => {
                const dateA = a.created_at || a.filled_at || '';
                const dateB = b.created_at || b.filled_at || '';
                return dateB.localeCompare(dateA);
            });

            res.json({
                success: true,
                count: uniqueOrders.length,
                orders: uniqueOrders.slice(0, limit)
            });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }
}
