/**
 * Routes for Telegram webhook
 */

import { Router } from 'express';
import { TelegramController } from '../controllers/telegram.controller';
import { TelegramBot } from '../../services/TelegramBot';

export function createTelegramRoutes(telegramBot: TelegramBot): Router {
    const router = Router();
    const controller = new TelegramController(telegramBot);

    // Webhook endpoint
    router.post('/webhook', (req, res) => controller.handleWebhook(req, res));
    router.get('/webhook', (req, res) => controller.getWebhookInfo(req, res));

    return router;
}

