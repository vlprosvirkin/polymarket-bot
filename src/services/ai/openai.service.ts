import OpenAI from 'openai';
import type { AIProvider, AIProviderResponse } from '../../types/ai-provider.js';
import { splitResponseIntoParts } from '../../utils/json-parsing-utils.js';
import { API_CONFIG } from '../../core/config.js';

export class OpenAIService implements AIProvider {
    private client: OpenAI;
    private model: string;
    private systemPrompt: string;

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
        console.log(`🤖 OpenAI Service initialized with model: ${this.model}`);
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
        let lastError: any;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const requestStartTime = Date.now();
                const systemPrompt = options.systemPrompt || this.systemPrompt;
                const maxTokens = options.maxTokens || API_CONFIG.openai.maxTokens;
                const temperature = options.temperature ?? 0.3;

                console.log(`🔍 OpenAI request using model: ${this.model} (attempt ${attempt}/${maxRetries})`);
                console.log(`   Prompt length: ${prompt.length} characters`);
                console.log(`   System prompt length: ${systemPrompt.length} characters`);

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
                console.log(`⏱️  OpenAI request completed in ${requestDuration}ms`);

                const content = response.choices[0]?.message?.content;
                if (!content) {
                    throw new Error('No content received from OpenAI');
                }

                // Check if response was truncated
                const finishReason = response.choices[0]?.finish_reason;
                if (finishReason === 'length') {
                    console.warn(`⚠️  OpenAI response was truncated (finish_reason: ${finishReason})`);
                }

                // Log token usage for cost tracking
                const usage = response.usage;
                if (usage) {
                    const modelInfo = this.getModelInfo();
                    console.log(`💰 Token usage: ${usage.prompt_tokens} input + ${usage.completion_tokens} output = ${usage.total_tokens} total (${modelInfo.model})`);
                }

                // Parse JSON if requested
                let textPart: string | undefined;
                let jsonPart: any | undefined;

                if (options.parseJson) {
                    const parsed = splitResponseIntoParts(content, 'openai', Date.now());
                    textPart = parsed.textPart;
                    if (parsed.hasValidJson) {
                        jsonPart = parsed.jsonPart;
                    }
                }

                console.log(`✅ OpenAI request successful on attempt ${attempt}`);

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

            } catch (error: any) {
                lastError = error;
                const isRetryable = error.message?.includes('ECONNRESET') ||
                    error.message?.includes('ETIMEDOUT') ||
                    error.message?.includes('Connection error') ||
                    error.message?.includes('Request timed out') ||
                    error.message?.includes('timeout') ||
                    error.status === 429 || // Rate limit
                    error.status === 500 || // Server error
                    error.status === 503;   // Service unavailable

                console.error(`❌ OpenAI API error (attempt ${attempt}/${maxRetries}):`, {
                    message: error.message,
                    status: error.status,
                    code: error.code,
                    isRetryable
                });

                if (isRetryable && attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff: 1s, 2s, 4s
                    console.log(`⏳ Retrying in ${delay}ms...`);
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
