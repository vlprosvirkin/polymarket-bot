/**
 * Telegram API Adapter
 *
 * Адаптер для работы с Telegram Bot API
 * Поддерживает отправку сообщений, фото и документов
 */

import axios, { AxiosInstance } from 'axios';

/**
 * Telegram message interface
 */
export interface TelegramMessage {
    text: string;
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    disable_web_page_preview?: boolean;
    reply_markup?: {
        inline_keyboard?: Array<Array<{
            text: string;
            callback_data?: string;
            url?: string;
        }>>;
    };
}

/**
 * Telegram Bot info response
 */
export interface TelegramBotInfo {
    id: number;
    is_bot: boolean;
    first_name: string;
    username: string;
    can_join_groups: boolean;
    can_read_all_group_messages: boolean;
    supports_inline_queries: boolean;
}

/**
 * Telegram API response
 */
interface TelegramAPIResponse<T> {
    ok: boolean;
    result?: T;
    description?: string;
    error_code?: number;
}

/**
 * Telegram API Adapter
 *
 * @example
 * ```typescript
 * const telegram = new TelegramAdapter();
 * await telegram.connect();
 * await telegram.sendMessage({ text: 'Hello!' });
 * ```
 */
export class TelegramAdapter {
    private client: AxiosInstance;
    private botToken: string;
    private chatId: string;
    private isConnectedFlag = false;
    private botInfo: TelegramBotInfo | null = null;

    constructor(botToken?: string, chatId?: string) {
        this.botToken = botToken || process.env.TELEGRAM_BOT_TOKEN || '';
        this.chatId = chatId || process.env.TELEGRAM_CHAT_ID || '';

        this.client = axios.create({
            baseURL: `https://api.telegram.org/bot${this.botToken}`,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Connect to Telegram and verify bot token
     */
    async connect(): Promise<void> {
        if (!this.botToken || !this.chatId) {
            throw new Error('Telegram bot token or chat ID not configured');
        }

        try {
            const response = await this.client.get<TelegramAPIResponse<TelegramBotInfo>>('/getMe');

            if (response.data.ok && response.data.result) {
                this.isConnectedFlag = true;
                this.botInfo = response.data.result;
                console.warn(`✅ Connected to Telegram bot: @${this.botInfo.username}`);
            } else {
                throw new Error('Failed to connect to Telegram bot');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Telegram connection failed: ${message}`);
        }
    }

    /**
     * Disconnect from Telegram
     */
    disconnect(): void {
        this.isConnectedFlag = false;
        this.botInfo = null;
    }

    /**
     * Check if adapter is connected
     */
    isConnected(): boolean {
        return this.isConnectedFlag;
    }

    /**
     * Get bot info
     */
    getBotInfo(): TelegramBotInfo | null {
        return this.botInfo;
    }

    /**
     * Send a message
     */
    async sendMessage(message: TelegramMessage, chatId?: string): Promise<void> {
        if (!this.botToken) {
            throw new Error('Telegram bot token not configured');
        }

        const targetChatId = chatId || this.chatId;
        if (!targetChatId) {
            throw new Error('Telegram chat ID not configured');
        }

        try {
            await this.client.post('/sendMessage', {
                chat_id: targetChatId,
                ...message
            });
        } catch (error) {
            console.error('Failed to send Telegram message:', error);
            throw error;
        }
    }

    /**
     * Send a photo
     */
    async sendPhoto(photo: string | Blob, caption?: string, chatId?: string): Promise<void> {
        const targetChatId = chatId || this.chatId;
        if (!this.botToken || !targetChatId) {
            throw new Error('Telegram bot token or chat ID not configured');
        }

        try {
            const formData = new FormData();
            formData.append('chat_id', targetChatId);
            formData.append('photo', photo);
            if (caption) {
                formData.append('caption', caption);
            }

            await this.client.post('/sendPhoto', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
        } catch (error) {
            console.error('Failed to send Telegram photo:', error);
            throw error;
        }
    }

    /**
     * Send a document
     */
    async sendDocument(document: string | Blob, caption?: string, chatId?: string): Promise<void> {
        const targetChatId = chatId || this.chatId;
        if (!this.botToken || !targetChatId) {
            throw new Error('Telegram bot token or chat ID not configured');
        }

        try {
            const formData = new FormData();
            formData.append('chat_id', targetChatId);
            formData.append('document', document);
            if (caption) {
                formData.append('caption', caption);
            }

            await this.client.post('/sendDocument', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
        } catch (error) {
            console.error('Failed to send Telegram document:', error);
            throw error;
        }
    }

    /**
     * Answer callback query (for inline buttons)
     */
    async answerCallbackQuery(callbackQueryId: string, options?: {
        text?: string;
        show_alert?: boolean;
        url?: string;
    }): Promise<void> {
        try {
            await this.client.post('/answerCallbackQuery', {
                callback_query_id: callbackQueryId,
                ...options
            });
        } catch (error) {
            console.error('Failed to answer callback query:', error);
            throw error;
        }
    }

    /**
     * Edit message text
     */
    async editMessageText(messageId: number, text: string, options?: {
        parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
        disable_web_page_preview?: boolean;
        reply_markup?: TelegramMessage['reply_markup'];
    }, chatId?: string): Promise<void> {
        const targetChatId = chatId || this.chatId;
        if (!targetChatId) {
            throw new Error('Telegram chat ID not configured');
        }

        try {
            await this.client.post('/editMessageText', {
                chat_id: targetChatId,
                message_id: messageId,
                text,
                ...options
            });
        } catch (error) {
            console.error('Failed to edit message:', error);
            throw error;
        }
    }

    /**
     * Delete a message
     */
    async deleteMessage(messageId: number, chatId?: string): Promise<void> {
        const targetChatId = chatId || this.chatId;
        if (!targetChatId) {
            throw new Error('Telegram chat ID not configured');
        }

        try {
            await this.client.post('/deleteMessage', {
                chat_id: targetChatId,
                message_id: messageId
            });
        } catch (error) {
            console.error('Failed to delete message:', error);
            throw error;
        }
    }

    /**
     * Set webhook URL
     */
    async setWebhook(url: string, options?: {
        certificate?: string;
        max_connections?: number;
        allowed_updates?: string[];
    }): Promise<void> {
        try {
            await this.client.post('/setWebhook', {
                url,
                ...options
            });
            console.warn(`✅ Telegram webhook set to: ${url}`);
        } catch (error) {
            console.error('Failed to set webhook:', error);
            throw error;
        }
    }

    /**
     * Delete webhook
     */
    async deleteWebhook(): Promise<void> {
        try {
            await this.client.post('/deleteWebhook');
            console.warn('✅ Telegram webhook deleted');
        } catch (error) {
            console.error('Failed to delete webhook:', error);
            throw error;
        }
    }

    /**
     * Get webhook info
     */
    async getWebhookInfo(): Promise<{
        url: string;
        has_custom_certificate: boolean;
        pending_update_count: number;
        last_error_date?: number;
        last_error_message?: string;
    }> {
        try {
            const response = await this.client.get<TelegramAPIResponse<{
                url: string;
                has_custom_certificate: boolean;
                pending_update_count: number;
                last_error_date?: number;
                last_error_message?: string;
            }>>('/getWebhookInfo');

            if (response.data.ok && response.data.result) {
                return response.data.result;
            }
            throw new Error('Failed to get webhook info');
        } catch (error) {
            console.error('Failed to get webhook info:', error);
            throw error;
        }
    }
}
