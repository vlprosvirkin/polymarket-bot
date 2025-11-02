import type {AIProvider, AIProviderResponse} from '../../types/ai-provider';
import {OpenAIService} from './openai.service';
import {GeminiService} from './gemini.service';

/**
 * AIService - единая точка доступа к AI провайдерам
 * Использует fail-fast подход: выбирается один провайдер при инициализации
 * Если провайдер недоступен - приложение падает сразу, а не в рантайме
 */
export class AIService implements AIProvider {
    private service: AIProvider;
    private readonly providerName: string;

    constructor(systemPrompt: string) {
        // Fail-fast: инициализируем только один сервис
        // Приоритет: OpenAI > Gemini
        if (process.env.OPENAI_API_KEY) {
            this.service = new OpenAIService(systemPrompt);
            this.providerName = 'OpenAI';
            console.log('✅ AIService initialized with OpenAI');
        } else if (process.env.GEMINI_API_KEY) {
            this.service = new GeminiService(systemPrompt);
            this.providerName = 'Gemini';
            console.log('✅ AIService initialized with Gemini');
        } else {
            throw new Error('No AI provider configured. Set OPENAI_API_KEY or GEMINI_API_KEY environment variable');
        }
    }

    async generateResponse(
        prompt: string,
        options: {
            maxTokens?: number;
            temperature?: number;
            systemPrompt?: string;
            parseJson?: boolean;
        } = {}
    ): Promise<AIProviderResponse> {
        try {
            return await this.service.generateResponse(prompt, options);
        } catch (error) {
            console.error(`❌ ${this.providerName} AI request failed:`, error);
            throw new Error(`AI request failed with ${this.providerName}: ${error}`);
        }
    }

    /**
     * Получить имя активного провайдера
     */
    getProviderName(): string {
        return this.providerName;
    }
}
