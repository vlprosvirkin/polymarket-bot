import axios from 'axios';
import { API_CONFIG } from '../core/config';

/**
 * Telegram message interface for sending messages
 */
export interface TelegramMessage {
    /** Message text content */
    text: string;
    /** Parse mode for message formatting */
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    /** Disable web page preview */
    disable_web_page_preview?: boolean;
    /** Inline keyboard markup */
    reply_markup?: {
        inline_keyboard?: Array<Array<{
            text: string;
            callback_data?: string;
            url?: string;
        }>>;
    };
}

/**
 * Telegram Adapter for sending messages, photos, and documents to Telegram
 * 
 * @example
 * ```typescript
 * const adapter = new TelegramAdapter();
 * await adapter.connect();
 * await adapter.sendMessage({ text: 'Hello!' });
 * ```
 */
export class TelegramAdapter {
    private botToken: string;
    private chatId: string;
    private baseUrl: string;
    private isConnectedFlag = false;

    /**
     * Create a new TelegramAdapter instance
     * 
     * @param botToken - Telegram bot token (optional, uses env var if not provided)
     * @param chatId - Telegram chat ID (optional, uses env var if not provided)
     */
    constructor(botToken?: string, chatId?: string) {
        this.botToken = botToken || API_CONFIG.telegram?.botToken || '';
        this.chatId = chatId || API_CONFIG.telegram?.chatId || '';
        this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
    }

    /**
     * Connect to Telegram and verify bot token
     * 
     * @throws {Error} If bot token or chat ID is not configured
     * @throws {Error} If connection to Telegram API fails
     */
    async connect(): Promise<void> {
        try {
            if (!this.botToken || !this.chatId) {
                throw new Error('Telegram bot token or chat ID not configured');
            }

            // Test connection by getting bot info
            const response = await axios.get(`${this.baseUrl}/getMe`);

            if (response.data.ok) {
                this.isConnectedFlag = true;
                console.log(`✅ Connected to Telegram bot: ${response.data.result.username}`);
            } else {
                throw new Error('Failed to connect to Telegram bot');
            }
        } catch (error) {
            throw new Error(`Telegram connection failed: ${error}`);
        }
    }

    /**
     * Disconnect from Telegram (clears connection flag)
     */
    async disconnect(): Promise<void> {
        this.isConnectedFlag = false;
    }

    /**
     * Check if adapter is connected to Telegram
     * 
     * @returns True if connected, false otherwise
     */
    isConnected(): boolean {
        return this.isConnectedFlag;
    }

    /**
     * Send a message to the configured Telegram chat
     * 
     * @param message - Message object with text and optional formatting
     * @param chatId - Optional chat ID override (uses default if not provided)
     * @throws {Error} If bot token or chat ID is not configured
     * @throws {Error} If message sending fails
     * 
     * @example
     * ```typescript
     * await adapter.sendMessage({ 
     *   text: 'Hello!', 
     *   parse_mode: 'HTML' 
     * });
     * ```
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
            await axios.post(`${this.baseUrl}/sendMessage`, {
                chat_id: targetChatId,
                ...message
            });
        } catch (error) {
            console.error('Failed to send Telegram message:', error);
            throw error;
        }
    }

    /**
     * Send a photo to the configured Telegram chat
     * 
     * @param photo - Photo file (URL string or Blob)
     * @param caption - Optional photo caption
     * @throws {Error} If bot token or chat ID is not configured
     * @throws {Error} If photo sending fails
     */
    async sendPhoto(photo: string | Blob, caption?: string): Promise<void> {
        if (!this.botToken || !this.chatId) {
            throw new Error('Telegram bot token or chat ID not configured');
        }

        try {
            const formData = new FormData();
            formData.append('chat_id', this.chatId);
            formData.append('photo', photo);
            if (caption) {
                formData.append('caption', caption);
            }

            await axios.post(`${this.baseUrl}/sendPhoto`, formData, {
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
     * Send a document to the configured Telegram chat
     * 
     * @param document - Document file (URL string or Blob)
     * @param caption - Optional document caption
     * @throws {Error} If bot token or chat ID is not configured
     * @throws {Error} If document sending fails
     */
    async sendDocument(document: string | Blob, caption?: string): Promise<void> {
        if (!this.botToken || !this.chatId) {
            throw new Error('Telegram bot token or chat ID not configured');
        }

        try {
            const formData = new FormData();
            formData.append('chat_id', this.chatId);
            formData.append('document', document);
            if (caption) {
                formData.append('caption', caption);
            }

            await axios.post(`${this.baseUrl}/sendDocument`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
        } catch (error) {
            console.error('Failed to send Telegram document:', error);
            throw error;
        }
    }
}

