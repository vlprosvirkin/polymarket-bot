/**
 * Telegram Bot service for handling commands and notifications
 * 
 * Provides command handling, notifications, and integration with ClobClient
 * for monitoring trading bot activity through Telegram.
 */

import { TelegramAdapter, TelegramMessage } from '../adapters/telegram.adapter';
import { ClobClient, AssetType } from '@polymarket/clob-client';
import { getErrorMessage } from '../types/errors';

/**
 * Telegram update interface for webhook messages
 */
export interface TelegramUpdate {
    update_id: number;
    message?: {
        message_id: number;
        from?: {
            id: number;
            username?: string;
            first_name?: string;
        };
        chat: {
            id: number;
            type: string;
        };
        text?: string;
        date: number;
    };
    callback_query?: {
        id: string;
        from: {
            id: number;
            username?: string;
        };
        message?: {
            message_id: number;
            chat: {
                id: number;
            };
        };
        data?: string;
    };
}

/**
 * Telegram Bot for handling commands and sending notifications
 * 
 * @example
 * ```typescript
 * const adapter = new TelegramAdapter();
 * await adapter.connect();
 * const bot = new TelegramBot(adapter, clobClient);
 * await bot.handleUpdate(update);
 * ```
 */
export class TelegramBot {
    private adapter: TelegramAdapter;
    private client: ClobClient;
    private allowedChatIds: Set<string>;

    /**
     * Create a new TelegramBot instance
     * 
     * @param adapter - TelegramAdapter instance for sending messages
     * @param client - ClobClient instance for accessing trading data
     * @param allowedChatIds - Optional array of allowed chat IDs (uses env var if not provided)
     */
    constructor(adapter: TelegramAdapter, client: ClobClient, allowedChatIds?: string[]) {
        this.adapter = adapter;
        this.client = client;
        this.allowedChatIds = new Set(allowedChatIds || [process.env.TELEGRAM_CHAT_ID || '']);
    }

    /**
     * Check if chat ID is allowed
     */
    private isAllowedChat(chatId: string): boolean {
        if (this.allowedChatIds.size === 0) {
            return true; // Allow all if no restrictions
        }
        return this.allowedChatIds.has(chatId);
    }

    /**
     * Handle incoming Telegram update (webhook message)
     * 
     * @param update - Telegram update object from webhook
     * @example
     * ```typescript
     * await bot.handleUpdate({
     *   update_id: 123,
     *   message: { text: '/status', chat: { id: 123456 } }
     * });
     * ```
     */
    async handleUpdate(update: TelegramUpdate): Promise<void> {
        try {
            const chatId = update.message?.chat.id.toString() || update.callback_query?.message?.chat.id.toString();
            
            if (!chatId) {
                return;
            }

            if (!this.isAllowedChat(chatId)) {
                await this.sendMessage(chatId, '❌ Доступ запрещен');
                return;
            }

            const text = update.message?.text || update.callback_query?.data;

            if (!text) {
                return;
            }

            // Handle commands
            if (text.startsWith('/')) {
                await this.handleCommand(chatId, text);
            }
        } catch (error) {
            console.error('Error handling Telegram update:', getErrorMessage(error));
        }
    }

    /**
     * Handle bot commands
     */
    private async handleCommand(chatId: string, command: string): Promise<void> {
        const [cmd, ...args] = command.split(' ');

        if (!cmd) {
            return;
        }

        switch (cmd.toLowerCase()) {
            case '/start':
            case '/help':
                await this.sendHelp(chatId);
                break;
            case '/status':
                await this.sendStatus(chatId);
                break;
            case '/balance':
                await this.sendBalance(chatId);
                break;
            case '/positions':
            case '/pos':
                await this.sendPositions(chatId);
                break;
            case '/orders':
                await this.sendOrders(chatId);
                break;
            case '/trades':
                await this.sendTrades(chatId, args[0] ? parseInt(args[0]) : 10);
                break;
            default:
                await this.sendMessage(chatId, `❓ Неизвестная команда: ${cmd}\n\nИспользуйте /help для списка команд`);
        }
    }

    /**
     * Send help message
     */
    private async sendHelp(chatId: string): Promise<void> {
        const helpText = `
🤖 <b>Polymarket Bot Commands</b>

📊 <b>Информация:</b>
/status - Статус бота и общая информация
/balance - Баланс USDC
/positions или /pos - Активные позиции с P&L
/orders - Открытые ордера
/trades [N] - Последние сделки (по умолчанию 10)

ℹ️ <b>Другое:</b>
/help - Показать это сообщение

<i>Бот автоматически отправляет уведомления о сделках и позициях</i>
        `.trim();

        await this.sendMessage(chatId, helpText, 'HTML');
    }

    /**
     * Send bot status
     */
    private async sendStatus(chatId: string): Promise<void> {
        try {
            const balanceResponse = await this.client.getBalanceAllowance({
                asset_type: AssetType.COLLATERAL
            });
            const balance = parseFloat(balanceResponse.balance) / 1e6; // USDC 6 decimals
            const openOrders = await this.client.getOpenOrders();
            const trades = await this.client.getTrades({});

            const statusText = `
✅ <b>Статус бота</b>

💰 <b>Баланс:</b> ${balance.toFixed(2)} USDC
📋 <b>Открытых ордеров:</b> ${openOrders.length}
📊 <b>Всего сделок:</b> ${trades.length}

⏰ <b>Время:</b> ${new Date().toLocaleString('ru-RU')}
            `.trim();

            await this.sendMessage(chatId, statusText, 'HTML');
        } catch (error) {
            await this.sendMessage(chatId, `❌ Ошибка получения статуса: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Send balance information
     */
    private async sendBalance(chatId: string): Promise<void> {
        try {
            const balanceResponse = await this.client.getBalanceAllowance({
                asset_type: AssetType.COLLATERAL
            });
            const balance = parseFloat(balanceResponse.balance) / 1e6; // USDC 6 decimals
            const text = `💰 <b>Баланс:</b> ${balance.toFixed(2)} USDC`;
            await this.sendMessage(chatId, text, 'HTML');
        } catch (error) {
            await this.sendMessage(chatId, `❌ Ошибка получения баланса: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Send active positions with P&L and current prices
     */
    private async sendPositions(chatId: string): Promise<void> {
        try {
            const trades = await this.client.getTrades({});
            
            // Group trades by asset_id
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

                if (trade.side === 'BUY') {
                    existing.buySize += size;
                    existing.totalCost += size * price;
                } else if (trade.side === 'SELL') {
                    existing.sellSize += size;
                    existing.totalCost -= size * price;
                }

                existing.trades++;
                positionMap.set(key, existing);
            }

            // Filter active positions (netSize > 0.01 or < -0.01)
            const positions = Array.from(positionMap.values())
                .filter(p => Math.abs(p.buySize - p.sellSize) > 0.01)
                .map(pos => {
                    const netSize = pos.buySize - pos.sellSize;
                    const avgPrice = pos.buySize > 0 ? pos.totalCost / pos.buySize : 0;
                    return {
                        ...pos,
                        netSize,
                        avgPrice,
                        status: netSize > 0 ? 'long' : 'short'
                    };
                });

            if (positions.length === 0) {
                await this.sendMessage(chatId, '📊 <b>Активных позиций нет</b>', 'HTML');
                return;
            }

            // Get current prices for P&L calculation
            const positionsWithPrice = await Promise.all(
                positions.map(async (pos) => {
                    try {
                        const midpoint = await this.client.getMidpoint(pos.asset_id);
                        let currentPrice: number;
                        
                        if (typeof midpoint === 'string') {
                            currentPrice = parseFloat(midpoint);
                        } else if (typeof midpoint === 'object' && midpoint !== null) {
                            const response = midpoint as { mid?: string; price?: string; midpoint?: string };
                            const priceStr = response.mid || response.price || response.midpoint || '0';
                            currentPrice = parseFloat(priceStr);
                        } else {
                            currentPrice = 0;
                        }

                        // Calculate P&L
                        const pnl = pos.status === 'long' 
                            ? (currentPrice - pos.avgPrice) * pos.netSize
                            : (pos.avgPrice - currentPrice) * Math.abs(pos.netSize);

                        return {
                            ...pos,
                            currentPrice,
                            pnl,
                            pnlPercent: pos.avgPrice > 0 
                                ? ((currentPrice - pos.avgPrice) / pos.avgPrice * 100)
                                : 0
                        };
                    } catch (error) {
                        // If we can't get price, return position without P&L
                        return {
                            ...pos,
                            currentPrice: null,
                            pnl: null,
                            pnlPercent: null
                        };
                    }
                })
            );

            // Sort by P&L (best first)
            positionsWithPrice.sort((a, b) => {
                if (a.pnl === null) return 1;
                if (b.pnl === null) return -1;
                return b.pnl - a.pnl;
            });

            let text = `📊 <b>Активные позиции (${positionsWithPrice.length}):</b>\n\n`;
            
            for (const pos of positionsWithPrice.slice(0, 10)) {
                const statusEmoji = pos.status === 'long' ? '📈' : '📉';
                const pnlEmoji = pos.pnl !== null && pos.pnl >= 0 ? '🟢' : pos.pnl !== null ? '🔴' : '⚪';
                
                text += `${statusEmoji} <b>${pos.outcome}</b> (${pos.status})\n`;
                text += `   Размер: ${pos.netSize.toFixed(2)}\n`;
                text += `   Средняя цена: ${(pos.avgPrice * 100).toFixed(2)}%\n`;
                
                if (pos.currentPrice !== null) {
                    text += `   Текущая цена: ${(pos.currentPrice * 100).toFixed(2)}%\n`;
                }
                
                text += `   Стоимость: ${Math.abs(pos.totalCost).toFixed(2)} USDC\n`;
                
                if (pos.pnl !== null) {
                    const pnlSign = pos.pnl >= 0 ? '+' : '';
                    text += `   ${pnlEmoji} P&L: ${pnlSign}${pos.pnl.toFixed(2)} USDC (${pnlSign}${pos.pnlPercent.toFixed(2)}%)\n`;
                }
                
                text += `   Сделок: ${pos.trades}\n`;
                text += `   Рынок: <code>${pos.market.substring(0, 30)}...</code>\n\n`;
            }

            if (positionsWithPrice.length > 10) {
                text += `... и еще ${positionsWithPrice.length - 10} позиций`;
            }

            // Calculate total P&L
            const totalPnL = positionsWithPrice
                .filter(p => p.pnl !== null)
                .reduce((sum, p) => sum + (p.pnl || 0), 0);
            
            if (totalPnL !== 0) {
                const totalPnLEmoji = totalPnL >= 0 ? '🟢' : '🔴';
                const totalPnLSign = totalPnL >= 0 ? '+' : '';
                text += `\n${totalPnLEmoji} <b>Общий P&L: ${totalPnLSign}${totalPnL.toFixed(2)} USDC</b>`;
            }

            await this.sendMessage(chatId, text, 'HTML');
        } catch (error) {
            await this.sendMessage(chatId, `❌ Ошибка получения позиций: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Send open orders
     */
    private async sendOrders(chatId: string): Promise<void> {
        try {
            const orders = await this.client.getOpenOrders();

            if (orders.length === 0) {
                await this.sendMessage(chatId, '📋 <b>Открытых ордеров нет</b>', 'HTML');
                return;
            }

            let text = `📋 <b>Открытые ордера (${orders.length}):</b>\n\n`;

            for (const order of orders.slice(0, 10)) {
                text += `🔹 <b>${order.side}</b> ${order.outcome}\n`;
                text += `   Цена: ${(parseFloat(order.price) * 100).toFixed(2)}%\n`;
                text += `   Размер: ${parseFloat(order.original_size)}\n`;
                text += `   Исполнено: ${parseFloat(order.size_matched)}\n`;
                text += `   ID: <code>${order.id.substring(0, 16)}...</code>\n\n`;
            }

            if (orders.length > 10) {
                text += `... и еще ${orders.length - 10} ордеров`;
            }

            await this.sendMessage(chatId, text, 'HTML');
        } catch (error) {
            await this.sendMessage(chatId, `❌ Ошибка получения ордеров: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Send recent trades
     */
    private async sendTrades(chatId: string, limit: number = 10): Promise<void> {
        try {
            const trades = await this.client.getTrades({});
            const recentTrades = trades.slice(0, limit);

            if (recentTrades.length === 0) {
                await this.sendMessage(chatId, '📊 <b>Сделок нет</b>', 'HTML');
                return;
            }

            let text = `📊 <b>Последние сделки (${recentTrades.length}):</b>\n\n`;

            for (const trade of recentTrades) {
                const date = new Date(trade.match_time);
                text += `🔹 <b>${trade.side}</b> ${trade.outcome}\n`;
                text += `   Цена: ${(parseFloat(trade.price) * 100).toFixed(2)}%\n`;
                text += `   Размер: ${parseFloat(trade.size)}\n`;
                text += `   Время: ${date.toLocaleString('ru-RU')}\n\n`;
            }

            await this.sendMessage(chatId, text, 'HTML');
        } catch (error) {
            await this.sendMessage(chatId, `❌ Ошибка получения сделок: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Send notification about order placement
     * 
     * @param orderId - Order ID
     * @param side - Order side (BUY/SELL)
     * @param outcome - Token outcome (Yes/No)
     * @param price - Order price (0-1)
     * @param size - Order size
     * @param market - Market question/description
     */
    async notifyOrderPlaced(orderId: string, side: string, outcome: string, price: number, size: number, market: string): Promise<void> {
        try {
            const text = `
✅ <b>Ордер размещен</b>

🔹 <b>${side}</b> ${outcome}
💰 Цена: ${(price * 100).toFixed(2)}%
📊 Размер: ${size}
🆔 ID: <code>${orderId.substring(0, 16)}...</code>
📋 Рынок: <code>${market.substring(0, 30)}...</code>
            `.trim();

            await this.adapter.sendMessage({
                text,
                parse_mode: 'HTML'
            });
        } catch (error) {
            console.error('Failed to send order notification:', getErrorMessage(error));
        }
    }

    /**
     * Send notification about order error
     * 
     * @param market - Market question/description
     * @param error - Error message
     */
    async notifyOrderError(market: string, error: string): Promise<void> {
        try {
            const text = `
❌ <b>Ошибка размещения ордера</b>

📋 Рынок: <code>${market.substring(0, 30)}...</code>
⚠️ Ошибка: ${error}
            `.trim();

            await this.adapter.sendMessage({
                text,
                parse_mode: 'HTML'
            });
        } catch (err) {
            console.error('Failed to send error notification:', getErrorMessage(err));
        }
    }

    /**
     * Send notification about position closed
     * 
     * @param market - Market question/description
     * @param pnl - Profit and Loss in USDC
     * @param reason - Reason for closing (e.g., "Профит: 95.00%")
     */
    async notifyPositionClosed(market: string, pnl: number, reason: string): Promise<void> {
        try {
            const pnlEmoji = pnl >= 0 ? '📈' : '📉';
            const text = `
💰 <b>Позиция закрыта</b>

${pnlEmoji} P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDC
📋 Рынок: <code>${market.substring(0, 30)}...</code>
ℹ️ Причина: ${reason}
            `.trim();

            await this.adapter.sendMessage({
                text,
                parse_mode: 'HTML'
            });
        } catch (error) {
            console.error('Failed to send position closed notification:', getErrorMessage(error));
        }
    }

    /**
     * Send notification about trade executed
     * 
     * @param side - Trade side (BUY/SELL)
     * @param outcome - Token outcome (Yes/No)
     * @param price - Trade price (0-1)
     * @param size - Trade size
     * @param market - Market question/description
     */
    async notifyTradeExecuted(side: string, outcome: string, price: number, size: number, market: string): Promise<void> {
        try {
            const text = `
🔄 <b>Сделка исполнена</b>

🔹 <b>${side}</b> ${outcome}
💰 Цена: ${(price * 100).toFixed(2)}%
📊 Размер: ${size}
📋 Рынок: <code>${market.substring(0, 30)}...</code>
            `.trim();

            await this.adapter.sendMessage({
                text,
                parse_mode: 'HTML'
            });
        } catch (error) {
            console.error('Failed to send trade notification:', getErrorMessage(error));
        }
    }

    /**
     * Helper to send message to specific chat
     */
    private async sendMessage(chatId: string, text: string, parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2'): Promise<void> {
        const message: TelegramMessage = {
            text,
            parse_mode: parseMode
        };

        await this.adapter.sendMessage(message, chatId);
    }
}

