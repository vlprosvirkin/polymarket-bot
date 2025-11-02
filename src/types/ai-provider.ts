export interface AIProviderResponse {
    response: string;
    textPart?: string;
    jsonPart?: any;
    metadata?: {
        model?: string;
        tokensUsed?: number;
        finishReason?: string;
    };
}

export interface AIProvider {
    /**
     * Generate a response with optional structured output parsing
     */
    generateResponse(
        prompt: string,
        options?: {
            maxTokens?: number;
            temperature?: number;
            systemPrompt?: string;
            parseJson?: boolean;
        }
    ): Promise<AIProviderResponse>;

    /**
     * Optional: Get model information
     */
    getModelInfo?(): { model: string; costPer1kTokens: string; maxTokens: number };
}
