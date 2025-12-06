/**
 * Routes для работы с позициями
 */

import { Router } from 'express';
import { PositionsController } from '../controllers/positions.controller';
import { ClobClient } from '@polymarket/clob-client';

export function createPositionsRoutes(client: ClobClient): Router {
    const router = Router();
    const controller = new PositionsController(client);

    // GET endpoints (Polymarket API)
    router.get('/orders', (req, res) => controller.getOpenOrders(req, res));
    router.get('/orders/all', (req, res) => controller.getAllOrders(req, res));
    router.get('/orders/:orderId', (req, res) => controller.getOrderStatus(req, res));
    router.get('/trades', (req, res) => controller.getTrades(req, res));
    router.get('/active', (req, res) => controller.getActivePositions(req, res));
    router.get('/balance', (req, res) => controller.getBalance(req, res));
    router.get('/summary', (req, res) => controller.getSummary(req, res));
    router.get('/status', (req, res) => controller.getPositionsStatus(req, res));
    router.get('/status/:tokenId', (req, res) => controller.getPositionStatus(req, res));

    // POST endpoints
    router.post('/create-order', (req, res) => controller.createOrder(req, res));

    // DELETE endpoints
    router.delete('/orders/:orderId', (req, res) => controller.cancelOrder(req, res));
    router.delete('/orders', (req, res) => controller.cancelAllOrders(req, res));

    // Database endpoints
    router.get('/db/health', (req, res) => controller.getDbHealth(req, res));
    router.get('/db/orders', (req, res) => controller.getDbOrders(req, res));
    router.get('/db/trades', (req, res) => controller.getDbTrades(req, res));
    router.get('/db/positions', (req, res) => controller.getDbPositions(req, res));
    router.get('/db/signals', (req, res) => controller.getDbSignals(req, res));
    router.get('/db/stats', (req, res) => controller.getDbStats(req, res));

    return router;
}
