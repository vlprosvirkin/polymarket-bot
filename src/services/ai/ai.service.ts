import type {AIProvider, AIProviderResponse} from '../../types/ai-provider.js';
import {OpenAIService} from './openai.service.js';
import {GeminiService} from './gemini.service.js';

export type AIServiceName = 'openai' | 'gemini';

export class AIService implements AIProvider {
    private openaiService: OpenAIService | null = null;
    private geminiService: GeminiService | null = null;
    private readonly systemPrompt: string;
    // fallback order
    private readonly providers: AIServiceName[];

    constructor(systemPrompt: string) {
        this.systemPrompt = systemPrompt;
        this.providers = ['openai', 'gemini']
        this.initializeServices();
    }

    private initializeServices(): void {
        if (process.env.OPENAI_API_KEY) {
            try {
                this.openaiService = new OpenAIService(this.systemPrompt);
                console.log('✅ OpenAI service initialized');
            } catch (error) {
                console.warn('⚠️ Failed to initialize OpenAI service:', error);
                this.openaiService = null;
            }
        } else {
            console.warn('⚠️ OPENAI_API_KEY not found, OpenAI service disabled');
        }

        if (process.env.GEMINI_API_KEY) {
            try {
                this.geminiService = new GeminiService(this.systemPrompt);
                console.log('✅ Gemini service initialized');
            } catch (error) {
                console.warn('⚠️ Failed to initialize Gemini service:', error);
                this.geminiService = null;
            }
        } else {
            console.warn('⚠️ GEMINI_API_KEY not found, Gemini service disabled');
        }

        if (!this.openaiService && !this.geminiService) {
            throw new Error('No AI services available. Please configure OPENAI_API_KEY or GEMINI_API_KEY');
        }
    }

    private getService(provider?: AIServiceName): AIProvider | null {
        switch (provider) {
            case 'openai': return this.openaiService;
            case 'gemini': return this.geminiService;
            default: return null;
        }
    }

    private async tryWithFallbackChain<T>(
      operation: (service: AIProvider) => Promise<T>,
      operationName: string
    ): Promise<T> {
        const errors: string[] = [];

        for (let i = 0; i < this.providers.length; i++) {
            const provider = this.providers[i];
            const service = this.getService(provider);

            if (!service) {
                continue;
            }

            try {
                return await operation(service);
            } catch (error) {
                const errorMsg = `${provider}: ${error}`;
                errors.push(errorMsg);
                console.error(`❌ ${operationName} failed with ${provider}:`, error);
            }
        }

        throw new Error(`${operationName} failed with all providers: ${errors.join(', ')}`);
    }

    async generateClaimsWithReasoning(
      userPrompt: string,
      context: any
    ): Promise<AIProviderResponse> {
        return this.tryWithFallbackChain(
          (service) => service.generateClaimsWithReasoning(userPrompt, context),
          'Generate claims with reasoning'
        );
    }

    async generateResponse(
      prompt: string,
      options: { maxTokens?: number; temperature?: number } = {}
    ): Promise<string> {
        return this.tryWithFallbackChain(
          (service) => service.generateResponse(prompt, options),
          'Generate response'
        );
    }
}
