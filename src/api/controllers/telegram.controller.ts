/**
 * Controller for Telegram webhook
 */

import { Request, Response } from 'express';
import { TelegramBot, TelegramUpdate } from '../../services/TelegramBot';
import { getErrorMessage, ErrorResponse } from '../../types/errors';

export class TelegramController {
    constructor(private telegramBot: TelegramBot) {}

    /**
     * POST /api/telegram/webhook
     * Handle incoming Telegram updates
     */
    handleWebhook(req: Request, res: Response): void {
        try {
            const update = req.body as TelegramUpdate;

            if (!update) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid update format'
                });
                return;
            }

            // Handle update asynchronously
            this.telegramBot.handleUpdate(update).catch(error => {
                console.error('Error handling Telegram update:', getErrorMessage(error));
            });

            // Respond immediately to Telegram
            res.status(200).json({ ok: true });
        } catch (error: unknown) {
            const errorResponse: ErrorResponse = {
                success: false,
                error: getErrorMessage(error)
            };
            res.status(500).json(errorResponse);
        }
    }

    /**
     * GET /api/telegram/webhook
     * Webhook info (for verification)
     */
    getWebhookInfo(_req: Request, res: Response): void {
        res.json({
            success: true,
            message: 'Telegram webhook endpoint',
            endpoint: '/api/telegram/webhook',
            method: 'POST'
        });
    }
}

