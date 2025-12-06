/**
 * REST API сервер для мониторинга бота
 */

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { ClobClient } from '@polymarket/clob-client';
import { createPositionsRoutes } from './routes/positions.routes';
import { createMarketsRoutes } from './routes/markets.routes';
import { createTelegramRoutes } from './routes/telegram.routes';
import { TelegramBot } from '../services/TelegramBot';
import { swaggerSpec } from './swagger';

export class ApiServer {
    private app: Express;
    private port: number;
    private client: ClobClient;
    private telegramBot?: TelegramBot;

    constructor(client: ClobClient, port: number = 3000, telegramBot?: TelegramBot) {
        this.app = express();
        this.port = port;
        this.client = client;
        this.telegramBot = telegramBot;

        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware() {
        // CORS
        this.app.use(cors());

        // JSON parser
        this.app.use(express.json());

        // Request logging
        this.app.use((req, _res, next) => {
            console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
            next();
        });
    }

    private setupRoutes() {
        // Health check
        this.app.get('/health', (_req: Request, res: Response) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });

        // API info
        this.app.get('/', (_req: Request, res: Response) => {
            res.json({
                name: 'Polymarket Bot API',
                version: '1.0.0',
                documentation: `http://localhost:${this.port}/api-docs`,
                endpoints: {
                    health: 'GET /health',
                    markets: {
                        analyze: 'GET /api/markets/analyze?limit=100',
                        filter: 'POST /api/markets/filter',
                        details: 'GET /api/markets/:conditionId',
                        aiAnalysis: 'POST /api/markets/:conditionId/ai-analysis'
                    },
                    positions: {
                        orders: 'GET /api/positions/orders',
                        ordersAll: 'GET /api/positions/orders/all?status=all',
                        orderStatus: 'GET /api/positions/orders/:orderId',
                        createOrder: 'POST /api/positions/create-order',
                        trades: 'GET /api/positions/trades?limit=20',
                        active: 'GET /api/positions/active',
                        balance: 'GET /api/positions/balance',
                        summary: 'GET /api/positions/summary',
                        cancelOrder: 'DELETE /api/positions/orders/:orderId',
                        cancelAll: 'DELETE /api/positions/orders'
                    },
                    telegram: this.telegramBot ? {
                        webhook: 'POST /api/telegram/webhook'
                    } : undefined
                }
            });
        });

        // Swagger documentation
        this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

        // Markets routes
        this.app.use('/api/markets', createMarketsRoutes(this.client));

        // Positions routes
        this.app.use('/api/positions', createPositionsRoutes(this.client));

        // Telegram routes (if telegram bot is configured)
        if (this.telegramBot) {
            this.app.use('/api/telegram', createTelegramRoutes(this.telegramBot));
        }

        // 404 handler
        this.app.use((req: Request, res: Response) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found',
                path: req.path
            });
        });

        // Error handler
        this.app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
            console.error('Error:', err);
            res.status(500).json({
                success: false,
                error: err.message
            });
        });
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`\n🚀 API Server running on http://localhost:${this.port}`);
            console.log(`📊 Dashboard: http://localhost:${this.port}`);
            console.log(`📋 Positions: http://localhost:${this.port}/api/positions/summary`);
            console.log(`📚 Swagger Docs: http://localhost:${this.port}/api-docs`);
            
            if (this.telegramBot) {
                console.log(`\n📱 Telegram Bot: Active`);
                console.log(`   Webhook: POST http://localhost:${this.port}/api/telegram/webhook`);
                console.log(`   Commands: /status, /balance, /positions, /orders, /trades`);
            } else {
                console.log(`\n⚠️  Telegram Bot: Not configured`);
            }
            
            console.log(`\nPress Ctrl+C to stop\n`);
        });
    }

    getApp(): Express {
        return this.app;
    }
}
