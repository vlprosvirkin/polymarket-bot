/**
 * JSON Parsing Utilities for OpenAI Responses
 * Handles incomplete JSON responses from AI models
 */
import fs from 'fs';
import path from 'path';
export interface ParsedResponse {
    textPart: string;
    jsonPart: any;
    hasValidJson: boolean;
    parseErrors: string[];
}

/**
 * Save AI response to file for analysis with parsed structure
 * Exported for use in other modules
 */
export function saveResponseToFile(content: string, agentType: string, timestamp: number, isTruncated: boolean = false): void {
    try {
        const outputDir = path.join(process.cwd(), 'analysis-outputs', 'agent-responses');

        // Create directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const filename = `${agentType}_${timestamp}_${isTruncated ? 'truncated' : 'complete'}.json`;
        const filepath = path.join(outputDir, filename);

        // Try to split response into text and JSON parts
        let textAnalysis = content;
        let jsonResponse: Record<string, unknown> | null = null;

        // Look for JSON block with markdown markers
        const jsonMarkdownMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMarkdownMatch && jsonMarkdownMatch[1]) {
            try {
                jsonResponse = JSON.parse(jsonMarkdownMatch[1].trim());
                // Extract text part (everything before the JSON block)
                const jsonBlockStart = content.indexOf('```json');
                textAnalysis = content.substring(0, jsonBlockStart).trim();
            } catch (e) {
                // JSON parsing failed, keep as text
            }
        }

        // If no markdown block, look for raw JSON (for portfolio agent responses)
        if (!jsonResponse) {
            const patterns = [
                /(\{\s*"claims"\s*:[\s\S]*\})/,
                /(\{\s*"portfolioInsights"\s*:[\s\S]*\})/,
                /(\{\s*"rebalancing"\s*:[\s\S]*\})/
            ];

            for (const pattern of patterns) {
                const match = content.match(pattern);
                if (match && match[1]) {
                    try {
                        // Find the complete JSON object
                        const jsonStart = content.indexOf(match[1].substring(0, 20));
                        if (jsonStart !== -1) {
                            const jsonEnd = findJSONEnd(content, jsonStart);
                            const jsonStr = content.substring(jsonStart, jsonEnd);
                            jsonResponse = JSON.parse(jsonStr);
                            textAnalysis = content.substring(0, jsonStart).trim();
                            break;
                        }
                    } catch (e) {
                        // Continue to next pattern
                    }
                }
            }
        }

        const responseData: Record<string, unknown> = {
            timestamp: new Date().toISOString(),
            agentType,
            isTruncated,
            contentLength: content.length
        };

        // Add parsed fields if available
        if (textAnalysis && textAnalysis !== content) {
            responseData.textAnalysis = textAnalysis;
        }

        if (jsonResponse) {
            responseData.jsonResponse = jsonResponse;
        }

        // Keep raw response for reference
        responseData.rawResponse = content;

        // Custom JSON serialization with readable newlines
        const jsonString = JSON.stringify(responseData, (key, value) => {
            // For text fields, keep newlines readable by using arrays of lines
            if ((key === 'textAnalysis' || key === 'rawResponse') && typeof value === 'string' && value.includes('\n')) {
                return value.split('\n');
            }
            return value;
        }, 2);

        fs.writeFileSync(filepath, jsonString);
        console.log(`💾 Saved ${agentType} response to: ${filepath}`);

    } catch (error) {
        console.error('❌ Failed to save response to file:', error);
    }
}

/**
 * Split OpenAI response into text and JSON parts
 */
export function splitResponseIntoParts(content: string, agentType: string = 'unknown', timestamp: number = Date.now()): ParsedResponse {
    const parseErrors: string[] = [];

    // Clean the content - remove markdown code blocks and comments
    const cleanedContent = content.trim()
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .replace(/\/\/.*$/gm, '') // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

    // Check if response appears truncated
    const isTruncated = content.includes('finish_reason: length') ||
        content.endsWith('...') ||
        content.length > 10000 && !content.includes('"claims"') ||
        !content.includes('}') ||
        content.split('{').length !== content.split('}').length;

    if (isTruncated) {
        console.error(`❌ TRUNCATED RESPONSE DETECTED for ${agentType}:`);
        console.error(`   - Content length: ${content.length}`);
        console.error(`   - Ends with: ${content.slice(-100)}`);
        console.error(`   - Missing closing braces: ${content.split('{').length - content.split('}').length}`);

        // Save truncated response for analysis
        saveResponseToFile(content, agentType, timestamp, true);

        parseErrors.push('Response was truncated by token limit');
    }

    // Try to find JSON part
    const jsonMatch = findJSONPart(cleanedContent);

    if (jsonMatch) {
        const { jsonPart, jsonStart } = jsonMatch;
        const textPart = cleanedContent.substring(0, jsonStart).trim();

        // Save successful response for analysis
        saveResponseToFile(content, agentType, timestamp, false);

        return {
            textPart: textPart || 'No text analysis available',
            jsonPart,
            hasValidJson: true,
            parseErrors
        };
    }

    // No JSON found
    parseErrors.push('No valid JSON found in response');

    // Save failed response for analysis
    saveResponseToFile(content, agentType, timestamp, isTruncated);

    return {
        textPart: cleanedContent,
        jsonPart: { claims: [] },
        hasValidJson: false,
        parseErrors
    };
}

/**
 * Find and parse JSON part in the content
 */
function findJSONPart(content: string): { jsonPart: any; jsonStart: number } | null {
    console.log('🔍 Searching for JSON in content length:', content.length);

    // Look for JSON object with "claims" field
    const claimsPattern = /\{\s*"claims"\s*:/;
    const match = content.match(claimsPattern);

    if (match) {
        const jsonStart = match.index!;
        console.log('🔍 Found claims pattern at position:', jsonStart);

        const jsonEnd = findJSONEnd(content, jsonStart);
        console.log('🔍 JSON end position:', jsonEnd);

        if (jsonEnd > jsonStart) {
            const jsonStr = content.substring(jsonStart, jsonEnd);
            console.log('🔍 Extracted JSON string length:', jsonStr.length);

            try {
                const jsonPart = JSON.parse(jsonStr);
                console.log('✅ Successfully parsed JSON');
                return { jsonPart, jsonStart };
            } catch (error) {
                console.warn('❌ Initial JSON parsing failed:', error instanceof Error ? error.message : String(error));

                // Try to fix common issues
                const fixedJson = fixIncompleteJSON(jsonStr);
                try {
                    const jsonPart = JSON.parse(fixedJson);
                    console.log('✅ Successfully parsed JSON after fixing');
                    return { jsonPart, jsonStart };
                } catch (error2) {
                    console.error('❌ Failed to parse JSON even after fixing:', error2 instanceof Error ? error2.message : String(error2));
                    console.error('🔍 Problematic JSON snippet:', jsonStr.substring(0, 500));

                    // Try to extract just the claims array as a last resort
                    const claimsArrayMatch = jsonStr.match(/"claims"\s*:\s*\[([\s\S]*?)\]/);
                    if (claimsArrayMatch && claimsArrayMatch[1]) {
                        try {
                            const claimsArray = JSON.parse('[' + claimsArrayMatch[1] + ']');
                            console.log('✅ Successfully parsed claims array as fallback');
                            return {
                                jsonPart: { claims: claimsArray },
                                jsonStart
                            };
                        } catch (error3) {
                            console.error('❌ Failed to parse claims array as fallback:', error3 instanceof Error ? error3.message : String(error3));
                        }
                    }
                }
            }
        } else {
            console.warn('❌ Invalid JSON end position:', jsonEnd);
        }
    } else {
        console.log('🔍 No claims pattern found in content');
    }

    return null;
}

/**
 * Fix incomplete JSON by adding missing closing braces/brackets
 */
function fixIncompleteJSON(jsonStr: string): string {
    // Fix incomplete URLs
    jsonStr = jsonStr.replace(/\"url\":\s*\"https:\n/g, '"url": "https://example.com"');
    jsonStr = jsonStr.replace(/\"url\":\s*\"https:\/\/[^\"]*$/g, '"url": "https://example.com"');
    jsonStr = jsonStr.replace(/\"url\":\s*\"[^\"]*$/g, '"url": "https://example.com"');

    // Remove trailing commas
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

    // Count braces and brackets
    let openBraces = (jsonStr.match(/\{/g) || []).length;
    let closeBraces = (jsonStr.match(/\}/g) || []).length;
    let openBrackets = (jsonStr.match(/\[/g) || []).length;
    let closeBrackets = (jsonStr.match(/\]/g) || []).length;

    // Add missing closing braces/brackets
    while (openBraces > closeBraces) {
        jsonStr += '}';
        closeBraces++;
    }
    while (openBrackets > closeBrackets) {
        jsonStr += ']';
        closeBrackets++;
    }

    return jsonStr;
}

/**
 * Find the end of a JSON object/array
 */
function findJSONEnd(content: string, startIndex: number): number {
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = startIndex; i < content.length; i++) {
        const char = content[i];

        if (escapeNext) {
            escapeNext = false;
            continue;
        }

        if (char === '\\') {
            escapeNext = true;
            continue;
        }

        if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
        }

        if (!inString) {
            if (char === '{') {
                braceCount++;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                    return i + 1;
                }
            } else if (char === '[') {
                bracketCount++;
            } else if (char === ']') {
                bracketCount--;
            }
        }
    }

    return content.length;
}

/**
 * Extract claims from parsed JSON
 */
export function extractClaimsFromJSON(jsonPart: any, context: any): any[] {
    // console.log('🔍 extractClaimsFromJSON: Starting claim extraction', {
    //     hasJsonPart: !!jsonPart,
    //     hasClaims: !!jsonPart?.claims,
    //     claimsCount: jsonPart?.claims?.length || 0,
    //     contextKeys: Object.keys(context || {}),
    //     hasFacts: !!context.facts,
    //     factsCount: context.facts?.length || 0
    // });

    const claimsArray = jsonPart?.claims || [];
    const validClaims = [];

    for (let i = 0; i < claimsArray.length; i++) {
        const claimData = claimsArray[i];
        // console.log(`🔍 Processing claim ${i + 1}/${claimsArray.length}:`, {
        //     ticker: claimData.ticker,
        //     hasClaim: !!claimData.claim,
        //     hasAction: !!claimData.action,
        //     confidence: claimData.confidence,
        //     agentRole: claimData.agentRole
        // });

        // Validate required fields
        if (!claimData.ticker) {
            console.warn(`Claim ${i}: Missing ticker field`);
            continue;
        }

        if (!claimData.claim && !claimData.action) {
            console.warn(`Claim ${i}: Missing claim/action field`);
            continue;
        }

        // Get evidence for this ticker (including GLOBAL evidence)
        const tickerEvidence = context.facts?.filter((e: any) => e && (e.ticker === claimData.ticker || e.ticker === 'GLOBAL')) || [];
        // Removed verbose evidence logging to reduce log noise

        const evidenceIds = tickerEvidence
            .filter((e: any) => e && e.id) // Filter out null/undefined evidence
            .map((e: any) => e.id)
            .slice(0, 3);

        // If no evidence found, create a fallback evidence ID
        if (evidenceIds.length === 0) {
            const fallbackId = `${claimData.ticker}_market_data_${context.timestamp}`;
            evidenceIds.push(fallbackId);
            // Removed verbose logging to reduce log noise
        }

        // Removed verbose evidence logging to reduce log noise

        const validClaim = {
            id: `${claimData.ticker}_${claimData.agentRole || 'unknown'}_${context.timestamp}_${i}`,
            ticker: claimData.ticker,
            agentRole: claimData.agentRole || 'unknown',
            direction: claimData.direction || claimData.claim || claimData.action || 'HOLD',
            confidence: Math.max(0, Math.min(1, claimData.confidence || 0.5)),
            evidence: evidenceIds,
            timestamp: context.timestamp,
            riskFlags: claimData.riskFlags || [],
            magnitude: claimData.magnitude,
            rationale: claimData.rationale,
            signals: claimData.signals
        };

        // console.log(`✅ Created valid claim ${i + 1}:`, {
        //     claimId: validClaim.id,
        //     ticker: validClaim.ticker,
        //     direction: validClaim.direction,
        //     confidence: validClaim.confidence,
        //     evidenceCount: validClaim.evidence.length,
        //     evidenceIds: validClaim.evidence,
        //     hasDirection: !!validClaim.direction,
        //     hasMagnitude: !!validClaim.magnitude,
        //     hasRationale: !!validClaim.rationale,
        //     signalsCount: validClaim.signals?.length || 0
        // });

        validClaims.push(validClaim);
    }

    console.log(`✅ Created ${validClaims.length} claims successfully`);

    return validClaims;
}

/**
 * Extract claims from text when JSON parsing fails
 */
export function extractClaimsFromText(textPart: string, context: any): any[] {
    const claims = [];
    const universe = context.universe || ['BTC', 'ETH'];

    // Look for patterns like "BTC: BUY" or "ETH: HOLD" in the text
    for (const ticker of universe) {
        const tickerPattern = new RegExp(`${ticker}[^\\n]*?(BUY|SELL|HOLD)`, 'gi');
        const matches = textPart.match(tickerPattern);

        if (matches && matches.length > 0) {
            const lastMatch = matches[matches.length - 1];
            if (lastMatch) {
                const actionMatch = lastMatch.match(/(BUY|SELL|HOLD)/i);

                if (actionMatch && actionMatch[1]) {
                    const action = actionMatch[1].toUpperCase();
                    const tickerEvidence = context.facts?.filter((e: any) => e && e.ticker === ticker) || [];
                    const evidenceIds = tickerEvidence
                        .filter((e: any) => e && e.id) // Filter out null/undefined evidence
                        .map((e: any) => e.id)
                        .slice(0, 3);

                    // If no evidence found, create a fallback evidence ID
                    if (evidenceIds.length === 0) {
                        evidenceIds.push(`${ticker}_market_data_${context.timestamp}`);
                    }

                    claims.push({
                        id: `${ticker}_${context.agentRole || 'unknown'}_${context.timestamp}_${claims.length}`,
                        ticker,
                        agentRole: context.agentRole || 'unknown',
                        claim: action,
                        confidence: 0.5,
                        evidence: evidenceIds,
                        timestamp: context.timestamp,
                        riskFlags: []
                    });
                }
            }
        }
    }

    return claims;
}

/**
 * Parse PortfolioAgent response (looks for portfolio recommendations JSON)
 * Similar to splitResponseIntoParts but searches for portfolio-specific fields
 */
export function parsePortfolioAgentResponse(llmResponse: string, agentType: string = 'portfolio', timestamp: number = Date.now()): any {
    console.log('🔍 parsePortfolioAgentResponse: Starting parse, content length:', llmResponse.length);

    // Clean the content - remove markdown code blocks
    const cleanedContent = llmResponse.trim()
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '');

    // First try to parse the entire response as JSON
    try {
        const parsed = JSON.parse(cleanedContent);
        console.log('✅ Successfully parsed entire response as JSON');
        saveResponseToFile(llmResponse, agentType, timestamp, false);
        return parsed;
    } catch (error) {
        console.log('🔍 Full JSON parse failed, searching for JSON object in response');
    }

    // Look for JSON object with portfolio-specific fields
    const portfolioPatterns = [
        /\{\s*"rebalancing"\s*:/,
        /\{\s*"portfolioInsights"\s*:/,
        /\{\s*"newPositions"\s*:/,
        /\{\s*"overallStrategy"\s*:/
    ];

    for (const pattern of portfolioPatterns) {
        const match = cleanedContent.match(pattern);
        if (match && match.index !== undefined) {
            const jsonStart = match.index;
            console.log('🔍 Found portfolio pattern at position:', jsonStart);

            const jsonEnd = findJSONEnd(cleanedContent, jsonStart);
            console.log('🔍 JSON end position:', jsonEnd);

            if (jsonEnd > jsonStart) {
                const jsonStr = cleanedContent.substring(jsonStart, jsonEnd);
                console.log('🔍 Extracted JSON string length:', jsonStr.length);

                try {
                    const parsed = JSON.parse(jsonStr);
                    console.log('✅ Successfully parsed portfolio JSON');
                    saveResponseToFile(llmResponse, agentType, timestamp, false);
                    return parsed;
                } catch (error) {
                    console.warn('❌ JSON parsing failed:', error instanceof Error ? error.message : String(error));

                    // Try to fix common issues
                    const fixedJson = fixIncompleteJSON(jsonStr);
                    try {
                        const parsed = JSON.parse(fixedJson);
                        console.log('✅ Successfully parsed JSON after fixing');
                        saveResponseToFile(llmResponse, agentType, timestamp, false);
                        return parsed;
                    } catch (error2) {
                        console.error('❌ Failed to parse JSON even after fixing:', error2 instanceof Error ? error2.message : String(error2));
                        console.error('🔍 Problematic JSON snippet:', jsonStr.substring(0, 500));
                    }
                }
            }
        }
    }

    // Last resort: try to find any JSON object
    console.log('🔍 Trying last resort: find any JSON object');
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const jsonContent = jsonMatch[0];
            const jsonEnd = findJSONEnd(jsonContent, 0);
            const validJson = jsonContent.substring(0, jsonEnd);
            const parsed = JSON.parse(validJson);
            console.log('✅ Successfully parsed JSON from fallback search');
            saveResponseToFile(llmResponse, agentType, timestamp, false);
            return parsed;
        } catch (error) {
            console.error('❌ Fallback JSON parsing failed:', error instanceof Error ? error.message : String(error));
        }
    }

    // Save failed response for debugging
    console.error('❌ No valid JSON found in PortfolioAgent response');
    console.log('Response preview:', llmResponse.substring(0, 300));
    saveResponseToFile(llmResponse, agentType, timestamp, true);

    throw new Error('No valid JSON found in PortfolioAgent response');
}

/**
 * Test JSON parsing with various scenarios
 */
export function testJSONParsing(): void {
    console.log('🧪 Testing JSON Parsing Utilities\n');

    const testCases = [
        {
            name: 'Valid JSON with claims',
            content: `ANALYSIS:
BTC shows strong fundamentals.

CLAIMS:
{
  "claims": [
    {
      "ticker": "BTC",
      "agentRole": "fundamental",
      "claim": "BUY",
      "confidence": 0.8,
      "evidence": ["BTC_news_1"],
      "riskFlags": []
    }
  ]
}`
        },
        {
            name: 'Missing ticker field',
            content: `ANALYSIS:
Mixed signals.

CLAIMS:
{
  "claims": [
    {
      "agentRole": "sentiment",
      "claim": "HOLD",
      "confidence": 0.5
    }
  ]
}`
        },
        {
            name: 'Invalid JSON (missing brace)',
            content: `ANALYSIS:
BTC analysis.

CLAIMS:
{
  "claims": [
    {
      "ticker": "BTC",
      "claim": "BUY",
      "confidence": 0.8
    }
  ]
  // Missing closing brace
`
        },
        {
            name: 'UNKNOWN ticker',
            content: `ANALYSIS:
Mixed conditions.

CLAIMS:
{
  "claims": [
    {
      "ticker": "UNKNOWN",
      "agentRole": "sentiment",
      "claim": "HOLD",
      "confidence": 0.2,
      "riskFlags": ["parse_error"]
    }
  ]
}`
        },
        {
            name: 'No JSON in response',
            content: `ANALYSIS:
BTC shows strong fundamentals.

No claims to make at this time.`
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n📋 Test: ${testCase.name}`);
        console.log('─'.repeat(40));

        try {
            const result = splitResponseIntoParts(testCase.content);

            console.log(`✅ Has valid JSON: ${result.hasValidJson}`);
            console.log(`📝 Text part length: ${result.textPart.length} chars`);
            console.log(`🔧 JSON part keys: ${Object.keys(result.jsonPart).join(', ')}`);

            if (result.parseErrors.length > 0) {
                console.log(`⚠️  Parse errors: ${result.parseErrors.join(', ')}`);
            }

            if (result.jsonPart.claims) {
                console.log(`📊 Claims count: ${result.jsonPart.claims.length}`);
                result.jsonPart.claims.forEach((claim: any, i: number) => {
                    console.log(`   Claim ${i + 1}: ${claim.ticker} - ${claim.claim} (${(claim.confidence * 100).toFixed(1)}%)`);
                    if (claim.riskFlags && claim.riskFlags.length > 0) {
                        console.log(`   ⚠️  Risk flags: ${claim.riskFlags.join(', ')}`);
                    }
                });
            }

        } catch (error) {
            console.error(`❌ Test failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testJSONParsing();
}
