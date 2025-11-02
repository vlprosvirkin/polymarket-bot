import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import type { AIProvider, AIProviderResponse } from '../../types/ai-provider.ts';
import { splitResponseIntoParts, extractClaimsFromJSON, extractClaimsFromText } from '../../utils/json-parsing-utils.ts';

export class GeminiService implements AIProvider {
    private client: GoogleGenerativeAI;
    private model: GenerativeModel;
    private readonly systemPrompt: string;

    constructor(systemPrompt: string) {
        this.systemPrompt = systemPrompt;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is required');

        this.client = new GoogleGenerativeAI(apiKey);

        const model = process.env.GEMINI_MODEL || (process.env.NODE_ENV == 'production'
            ? 'gemini-2.5-flash'
            : 'gemini-2.5-flash');

        this.model = this.client.getGenerativeModel({
            model,
            systemInstruction: systemPrompt,
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 4000
            }
        });

        console.log(`🤖 Gemini Service initialized with model: ${model}`);
    }

    async generateClaimsWithReasoning(
        userPrompt: string,
        context: any
    ): Promise<AIProviderResponse> {
        try {
            // Generate unique request ID
            const requestId = `${context.agentRole || 'unknown'}_${context.timestamp}_${Math.random().toString(36).substr(2, 9)}`;
            console.log(`🔍 Gemini Request ID: ${requestId}`);

            const result = await this.model.generateContent(userPrompt);
            const content = result.response.text();

            if (!content) {
                throw new Error('No content received from Gemini');
            }

            // Log token usage for cost tracking (Gemini doesn't provide usage info in the same way)
            console.log(`💰 Gemini response generated`);

            // Split response into text part and JSON part
            const { textPart, jsonPart, hasValidJson } = splitResponseIntoParts(content, context.agentRole || 'gemini', context.timestamp || Date.now());

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

            return {
                claims,
                openaiResponse: content,
                textPart,
                jsonPart
            };

        } catch (error) {
            console.error('Gemini API error:', error);
            throw new Error(`Failed to generate claims: ${error}`);
        }
    }

    // Simple response generation for summaries
    async generateResponse(
        userPrompt: string,
        options: { maxTokens?: number; temperature?: number } = {}
    ): Promise<string> {
        try {
            console.log(`🔍 Generating simple Gemini response`);

            if (options.maxTokens || options.temperature) {
                this.model = this.client.getGenerativeModel({
                    model: process.env.GEMINI_MODEL || (process.env.NODE_ENV == 'production'
                        ? 'gemini-2.5-flash'
                        : 'gemini-2.5-flash'),
                    systemInstruction: this.systemPrompt,
                    generationConfig: {
                        temperature: options.temperature ?? 0.3,
                        maxOutputTokens: options.maxTokens ?? 4000
                    }
                });
            }

            const result = await this.model.generateContent(userPrompt);
            const content = result.response.text();

            if (!content) throw new Error('No content received from Gemini');

            console.log(`💰 Simple Gemini response generated`);

            return content;
        } catch (error) {
            console.error('Gemini API error:', error);
            throw new Error(`Failed to generate response: ${error}`);
        }
    }
}
