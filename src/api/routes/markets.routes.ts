/**
 * Routes для работы с рынками
 */

import { Router } from 'express';
import { MarketsController } from '../controllers/markets.controller';
import { ClobClient } from '@polymarket/clob-client';

export function createMarketsRoutes(client: ClobClient): Router {
    const router = Router();
    const controller = new MarketsController(client);

    // GET endpoints
    router.get('/analyze', (req, res) => controller.analyzeMarkets(req, res));
    router.get('/:conditionId', (req, res) => controller.getMarketDetails(req, res));

    // POST endpoints
    router.post('/filter', (req, res) => controller.filterMarkets(req, res));
    router.post('/:conditionId/ai-analysis', (req, res) => controller.getAIAnalysis(req, res));

    return router;
}

