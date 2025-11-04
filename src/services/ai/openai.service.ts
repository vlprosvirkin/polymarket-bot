import OpenAI from 'openai';
import type { AIProvider, AIProviderResponse } from '../../types/ai-provider';
import { splitResponseIntoParts } from '../../utils/json-parsing-utils';
import { API_CONFIG } from '../../core/config';
import { createLogger } from '../../utils/logger';

export class OpenAIService implements AIProvider {
    private client: OpenAI;
    private model: string;
    private systemPrompt: string;
    private logger = createLogger('OpenAIService');

    constructor(systemPrompt: string) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is required');
        }

        this.client = new OpenAI({
            apiKey: apiKey
        });

        this.systemPrompt = systemPrompt;
        // Model selection based on environment
        this.model = this.selectModel();
        this.logger.info('Service initialized', { model: this.model });
    }

    /**
     * Select appropriate model based on environment
     * Dev/Test: Use cheaper models to save costs
     * Prod: Use high-quality models for best results
     */
    private selectModel(): string {
        const env = process.env.NODE_ENV || 'development';
        const forceModel = process.env.OPENAI_MODEL; // Allow manual override

        if (forceModel) {
            console.log(`🔧 Using forced model: ${forceModel}`);
            return forceModel;
        }

        // Model selection logic
        if (env === 'production') {
            return 'gpt-4o'; // Best quality for production (newest model)
        } else {
            // Development and testing environments
            return 'gpt-4o-mini'; // Cheapest for development and testing
        }
    }

    /**
     * Get current model info for debugging
     */
    public getModelInfo(): { model: string; costPer1kTokens: string; maxTokens: number } {
        // Updated prices as of 2024 (from OpenAI API documentation)
        const modelInfo = {
            'gpt-4o': { costPer1kTokens: '$0.0025 (input) / $0.01 (output)', maxTokens: 128000 },
            'gpt-4o-mini': { costPer1kTokens: '$0.00015 (input) / $0.0006 (output)', maxTokens: 128000 },
            'gpt-4-turbo': { costPer1kTokens: '$0.01 (input) / $0.03 (output)', maxTokens: 128000 },
            'gpt-4': { costPer1kTokens: '$0.03 (input) / $0.06 (output)', maxTokens: 8192 },
            'gpt-3.5-turbo': { costPer1kTokens: '$0.0005 (input) / $0.0015 (output)', maxTokens: 16385 }
        };

        const info = modelInfo[this.model as keyof typeof modelInfo] || { costPer1kTokens: 'Unknown', maxTokens: 2000 };

        return {
            model: this.model,
            costPer1kTokens: info.costPer1kTokens,
            maxTokens: info.maxTokens
        };
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
        const maxRetries = 3;
        let lastError: unknown;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const requestStartTime = Date.now();
                const systemPrompt = options.systemPrompt || this.systemPrompt;
                const maxTokens = options.maxTokens || API_CONFIG.openai.maxTokens;
                const temperature = options.temperature ?? 0.3;

                this.logger.info('Sending request', {
                    model: this.model,
                    attempt: attempt,
                    maxRetries: maxRetries,
                    promptLength: prompt.length,
                    systemPromptLength: systemPrompt.length,
                    temperature: temperature,
                    maxTokens: maxTokens
                });

                const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

                if (systemPrompt) {
                    messages.push({
                        role: 'system',
                        content: systemPrompt
                    });
                }

                messages.push({
                    role: 'user',
                    content: prompt
                });

                const requestOptions: OpenAI.Chat.ChatCompletionCreateParams = {
                    model: this.model,
                    messages,
                    temperature,
                    max_tokens: maxTokens
                };

                // Force JSON output if requested
                if (options.parseJson) {
                    requestOptions.response_format = { type: "json_object" };
                }

                const response = await this.client.chat.completions.create(requestOptions, {
                    timeout: 120000  // 120 second timeout
                });

                const requestDuration = Date.now() - requestStartTime;
                const content = response.choices[0]?.message?.content;
                if (!content) {
                    throw new Error('No content received from OpenAI');
                }

                // Check if response was truncated
                const finishReason = response.choices[0]?.finish_reason;
                if (finishReason === 'length') {
                    this.logger.warn('Response was truncated', { finishReason: finishReason });
                }

                // Log token usage for cost tracking
                const usage = response.usage;
                if (usage) {
                    this.logger.info('Request completed', {
                        durationMs: requestDuration,
                        promptTokens: usage.prompt_tokens,
                        completionTokens: usage.completion_tokens,
                        totalTokens: usage.total_tokens,
                        finishReason: finishReason
                    });
                }

                // Parse JSON if requested
                let textPart: string | undefined;
                let jsonPart: import('../../types/json').UnknownJSON | undefined;

                if (options.parseJson) {
                    const parsed = splitResponseIntoParts(content, 'openai', Date.now());
                    textPart = parsed.textPart;
                    if (parsed.hasValidJson) {
                        jsonPart = parsed.jsonPart;
                    }
                }

                return {
                    response: content,
                    textPart,
                    jsonPart,
                    metadata: {
                        model: this.model,
                        tokensUsed: usage?.total_tokens,
                        finishReason
                    }
                };

            } catch (error: unknown) {
                lastError = error;
                const errorMessage = error instanceof Error ? error.message : String(error);

                // Типизируем ошибку с возможными полями API
                interface ApiError {
                    status?: number;
                    code?: string;
                }
                const apiError = error as ApiError;
                const errorStatus = apiError.status;
                const isRetryable = errorMessage.includes('ECONNRESET') ||
                    errorMessage.includes('ETIMEDOUT') ||
                    errorMessage.includes('Connection error') ||
                    errorMessage.includes('Request timed out') ||
                    errorMessage.includes('timeout') ||
                    errorStatus === 429 || // Rate limit
                    errorStatus === 500 || // Server error
                    errorStatus === 503;   // Service unavailable

                this.logger.error('API request failed', error, {
                    attempt: attempt,
                    maxRetries: maxRetries,
                    status: apiError.status,
                    code: apiError.code,
                    isRetryable: isRetryable
                });

                if (isRetryable && attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff: 1s, 2s, 4s
                    this.logger.info('Retrying request', { delayMs: delay, nextAttempt: attempt + 1 });
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // Not retryable or max retries reached
                throw new Error(`Failed to generate response: ${error}`);
            }
        }

        // Should never reach here, but TypeScript needs it
        throw new Error(`Failed to generate response after ${maxRetries} attempts: ${lastError}`);
    }
}
