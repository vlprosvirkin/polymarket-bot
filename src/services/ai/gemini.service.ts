import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import type { AIProvider, AIProviderResponse } from '../../types/ai-provider';
import { splitResponseIntoParts } from '../../utils/json-parsing-utils';

export class GeminiService implements AIProvider {
    private client: GoogleGenerativeAI;
    private model: GenerativeModel;
    private readonly systemPrompt: string;
    private readonly modelName: string;

    constructor(systemPrompt: string) {
        this.systemPrompt = systemPrompt;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is required');

        this.client = new GoogleGenerativeAI(apiKey);

        this.modelName = process.env.GEMINI_MODEL || (process.env.NODE_ENV == 'production'
            ? 'gemini-2.5-flash'
            : 'gemini-2.5-flash');

        this.model = this.client.getGenerativeModel({
            model: this.modelName,
            systemInstruction: systemPrompt,
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 4000
            }
        });

        console.log(`🤖 Gemini Service initialized with model: ${this.modelName}`);
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
            const systemPrompt = options.systemPrompt || this.systemPrompt;

            // Update model config if options changed
            if (options.maxTokens || options.temperature !== undefined) {
                this.model = this.client.getGenerativeModel({
                    model: this.modelName,
                    systemInstruction: systemPrompt,
                    generationConfig: {
                        temperature: options.temperature ?? 0.3,
                        maxOutputTokens: options.maxTokens ?? 4000
                    }
                });
            }

            console.log(`🔍 Generating Gemini response`);

            const result = await this.model.generateContent(prompt);
            const content = result.response.text();

            if (!content) {
                throw new Error('No content received from Gemini');
            }

            // Parse JSON if requested
            let textPart: string | undefined;
            let jsonPart: import('../../types/json').UnknownJSON | undefined;

            if (options.parseJson) {
                const parsed = splitResponseIntoParts(content, 'gemini', Date.now());
                textPart = parsed.textPart;
                if (parsed.hasValidJson) {
                    jsonPart = parsed.jsonPart;
                }
            }

            console.log(`💰 Gemini response generated`);

            return {
                response: content,
                textPart,
                jsonPart,
                metadata: {
                    model: this.modelName,
                    finishReason: result.response.candidates?.[0]?.finishReason
                }
            };

        } catch (error) {
            console.error('Gemini API error:', error);
            throw new Error(`Failed to generate response: ${error}`);
        }
    }
}
