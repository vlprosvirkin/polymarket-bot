/**
 * Контроллер для работы с позициями и ордерами
 */

import { Request, Response } from 'express';
import { ClobClient, AssetType, Side } from '@polymarket/clob-client';
import { getErrorMessage, ErrorResponse } from '../../types/errors';

export class PositionsController {
    constructor(private client: ClobClient) {}

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
                pricePercent: (parseFloat(order.price) * 100).toFixed(2) + '%',
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
                pricePercent: (parseFloat(trade.price) * 100).toFixed(2) + '%',
                size: parseFloat(trade.size),
                feeRateBps: parseFloat(trade.fee_rate_bps),
                feePercent: (parseFloat(trade.fee_rate_bps) / 100).toFixed(2) + '%',
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
                        price: (parseFloat(o.price) * 100).toFixed(2) + '%'
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
}
