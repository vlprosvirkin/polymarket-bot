import OpenAI from 'openai';
import type { Claim } from '../../types/index.js';
import type { AIProvider, AIProviderResponse } from '../../types/ai-provider.js';
import { splitResponseIntoParts, extractClaimsFromJSON, extractClaimsFromText } from '../../utils/json-parsing-utils.js';
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

    async generateClaimsWithReasoning(
        userPrompt: string,
        context: any
    ): Promise<AIProviderResponse> {
        const requestId = `${context.agentRole || 'unknown'}_${context.timestamp}_${Math.random().toString(36).substr(2, 9)}`;
        const maxRetries = 3;
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const requestStartTime = Date.now();
                console.log(`🔍 OpenAI Request ID: ${requestId} using model: ${this.model} (attempt ${attempt}/${maxRetries})`);
                console.log(`   Agent: ${context.agentRole}`);
                console.log(`   Prompt length: ${userPrompt.length} characters`);
                console.log(`   System prompt length: ${this.systemPrompt.length} characters`);

                const response = await this.client.chat.completions.create({
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content: this.systemPrompt
                        },
                        {
                            role: 'user',
                            content: userPrompt
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: API_CONFIG.openai.maxTokens
                }, {
                    timeout: 120000  // 120 second timeout (increased from 60s)
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
                    console.warn(`⚠️  OpenAI response was truncated (finish_reason: ${finishReason}). This may cause JSON parsing issues.`);
                }

                // Log token usage for cost tracking
                const usage = response.usage;
                if (usage) {
                    const modelInfo = this.getModelInfo();
                    console.log(`💰 Token usage: ${usage.prompt_tokens} input + ${usage.completion_tokens} output = ${usage.total_tokens} total (${modelInfo.model})`);
                }

                // Split response into text part and JSON part
                const { textPart, jsonPart, hasValidJson } = splitResponseIntoParts(content, context.agentRole || 'openai', context.timestamp || Date.now());

                // Parse claims from JSON part or text if JSON parsing failed
                let claims;
                if (hasValidJson) {
                    claims = extractClaimsFromJSON(jsonPart, {
                        ...context,
                        timestamp: context.timestamp,
                        requestId
                    });
                } else {
                    // Fallback: extract claims from text (for sentiment agent)
                    claims = extractClaimsFromText(textPart, {
                        ...context,
                        timestamp: context.timestamp,
                        requestId
                    });
                }

                // Success! Return immediately
                console.log(`✅ OpenAI request successful on attempt ${attempt}`);
                return {
                    claims,
                    openaiResponse: content,
                    textPart,
                    jsonPart
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
                throw new Error(`Failed to generate claims: ${error}`);
            }
        }

        // Should never reach here, but TypeScript needs it
        throw new Error(`Failed to generate claims after ${maxRetries} attempts: ${lastError}`);
    }

    // Backward compatibility method
    async generateClaims(
        userPrompt: string,
        context: any
    ): Promise<Claim[]> {
        const result = await this.generateClaimsWithReasoning(userPrompt, context);
        return result.claims;
    }

    // Simple response generation for summaries
    async generateResponse(
        prompt: string,
        options: { maxTokens?: number; temperature?: number } = {}
    ): Promise<string> {
        try {
            console.log(`🔍 Generating simple response using model: ${this.model}`);

            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'user',
                        content: prompt.toLowerCase().includes('json')
                            ? prompt
                            : `${prompt}\n\nProvide your response in JSON format.`
                    }
                ],
                temperature: options.temperature || 0.3,
                max_tokens: options.maxTokens || 500,
                response_format: { type: "json_object" } // Force JSON output for PortfolioAgent
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error('No content received from OpenAI');
            }

            // Log token usage for cost tracking
            const usage = response.usage;
            if (usage) {
                const modelInfo = this.getModelInfo();
                console.log(`💰 Simple response tokens: ${usage.prompt_tokens} + ${usage.completion_tokens} = ${usage.total_tokens} (${modelInfo.model})`);
            }

            return content;
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw new Error(`Failed to generate response: ${error}`);
        }
    }
}
