/**
 * Routes для работы с позициями
 */

import { Router } from 'express';
import { PositionsController } from '../controllers/positions.controller';
import { ClobClient } from '@polymarket/clob-client';

export function createPositionsRoutes(client: ClobClient): Router {
    const router = Router();
    const controller = new PositionsController(client);

    // GET endpoints
    router.get('/orders', (req, res) => controller.getOpenOrders(req, res));
    router.get('/trades', (req, res) => controller.getTrades(req, res));
    router.get('/active', (req, res) => controller.getActivePositions(req, res));
    router.get('/balance', (req, res) => controller.getBalance(req, res));
    router.get('/summary', (req, res) => controller.getSummary(req, res));

    // DELETE endpoints
    router.delete('/orders/:orderId', (req, res) => controller.cancelOrder(req, res));
    router.delete('/orders', (req, res) => controller.cancelAllOrders(req, res));

    return router;
}
