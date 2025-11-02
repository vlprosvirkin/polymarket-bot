/**
 * REST API сервер для мониторинга бота
 */

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { ClobClient } from '@polymarket/clob-client';
import { createPositionsRoutes } from './routes/positions.routes';

export class ApiServer {
    private app: Express;
    private port: number;
    private client: ClobClient;

    constructor(client: ClobClient, port: number = 3000) {
        this.app = express();
        this.port = port;
        this.client = client;

        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware() {
        // CORS
        this.app.use(cors());

        // JSON parser
        this.app.use(express.json());

        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
            next();
        });
    }

    private setupRoutes() {
        // Health check
        this.app.get('/health', (req: Request, res: Response) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });

        // API info
        this.app.get('/', (req: Request, res: Response) => {
            res.json({
                name: 'Polymarket Bot API',
                version: '1.0.0',
                endpoints: {
                    health: 'GET /health',
                    positions: {
                        orders: 'GET /api/positions/orders',
                        trades: 'GET /api/positions/trades?limit=20',
                        active: 'GET /api/positions/active',
                        balance: 'GET /api/positions/balance',
                        summary: 'GET /api/positions/summary',
                        cancelOrder: 'DELETE /api/positions/orders/:orderId',
                        cancelAll: 'DELETE /api/positions/orders'
                    }
                }
            });
        });

        // Positions routes
        this.app.use('/api/positions', createPositionsRoutes(this.client));

        // 404 handler
        this.app.use((req: Request, res: Response) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found',
                path: req.path
            });
        });

        // Error handler
        this.app.use((err: Error, req: Request, res: Response, next: any) => {
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
            console.log(`\nPress Ctrl+C to stop\n`);
        });
    }

    getApp(): Express {
        return this.app;
    }
}
