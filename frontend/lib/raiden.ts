/**
 * lib/raiden.ts — Typed API client for the Raiden AI API.
 *
 * This module enables direct HTTP calls to the custom Raiden API endpoint, 
 * including fail-safe mechanisms for automated model selection and fallback logic.
 */

import {
    RAIDEN_BASE_URL,
    REQUEST_TIMEOUT_MS,
    MAX_URL_LENGTH,
} from "./config";
import { withTimeout, withRetry, RaidenError } from "./retry";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface RaidenResponse {
    text: string;
    status: number;
}

export type AIRequestType = "chat" | "agent";

// ─────────────────────────────────────────────
// Model Management & Fail-Safe
// ─────────────────────────────────────────────

let cachedModels: string[] | null = null;
let lastFetchTime = 0;
const MODELS_CACHE_TTL = 1000 * 60 * 5; // 5 minutes cache

/**
 * Fetches available models from the Raiden API.
 */
export async function getAvailableModels(): Promise<string[]> {
    if (cachedModels && Date.now() - lastFetchTime < MODELS_CACHE_TTL) {
        return cachedModels;
    }

    try {
        const response = await fetch("https://api.raiden.ovh/ai/models", {
            method: "GET",
            headers: { Accept: "application/json" }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && Array.isArray(data.models)) {
                // Deduplicate array
                cachedModels = Array.from(new Set(data.models as string[]));
                lastFetchTime = Date.now();
                return cachedModels;
            }
        }
    } catch (error) {
        console.error("Failed to fetch Raiden models:", error);
    }
    
    // Fallback if the endpoint is down
    return ["gpt-4o-latest", "claude-sonnet-4", "gemini-2.5-pro"]; 
}

/**
 * Determines the preferred list of models for the given interaction type.
 */
function getPreferredModelList(type: AIRequestType, available: string[]): string[] {
    let idealOrder: string[] = [];
    if (type === "chat") {
        idealOrder = [
            "gpt-4o-latest",
            "claude-sonnet-4",
            "gemini-2.5-pro",
            "o3-mini",
            "deepseek-v3.1",
            "deepseek-v3"
        ];
    } else {
        idealOrder = [
            "claude-sonnet-4",
            "deepseek-r1",
            "gpt-5",
            "gpt-4o-latest",
            "o3-mini",
            "deepseek-v3.1"
        ];
    }

    // Filter available models that match our ideal order
    const preferredAvailable = idealOrder.filter(m => available.includes(m));
    
    // Fallback: in case all ideal order models fail, we could append the rest of available models.
    const remaining = available.filter(m => !preferredAvailable.includes(m));

    return [...preferredAvailable, ...remaining];
}

// ─────────────────────────────────────────────
// Core API Client
// ─────────────────────────────────────────────

/**
 * Makes a single request to the Raiden AI API, with fail-safe fallback.
 */
export async function raidenAI(
    text: string,
    newSession: boolean = false,
    timeoutMs: number = REQUEST_TIMEOUT_MS,
    type: AIRequestType = "chat"
): Promise<string> {
    const availableModels = await getAvailableModels();
    const tryModels = getPreferredModelList(type, availableModels);

    let lastError: Error | null = null;

    for (const model of tryModels) {
        try {
            console.log(`[raiden] Attempting model: ${model} for type: ${type}`);
            
            // Core generation logic
            const responseText = await withRetry(async () => {
                return withTimeout(
                    async (signal: AbortSignal) => {
                        const url = new URL(RAIDEN_BASE_URL);
                        url.searchParams.set("text", text);
                        url.searchParams.set("model", model);
                        url.searchParams.set("new_session", String(newSession));

                        const urlString = url.toString();
                        if (urlString.length > MAX_URL_LENGTH) {
                            const overhead = urlString.length - text.length;
                            const maxTextLength = MAX_URL_LENGTH - overhead - 40;
                            const halfLen = Math.floor(maxTextLength / 2);
                            const truncatedText = text.slice(0, halfLen) + "\n...[TRUNCATED]...\n" + text.slice(-halfLen);
                            url.searchParams.set("text", truncatedText);
                        }

                        const response = await fetch(url.toString(), {
                            method: "GET",
                            signal,
                            headers: {
                                Accept: "text/plain, application/json",
                            },
                        });

                        if (!response.ok) {
                            const errorText = await response.text().catch(() => "Unknown error");
                            throw new RaidenError(
                                response.status,
                                `Raiden API error (${response.status}): ${errorText}`
                            );
                        }

                        const responseJSON = await response.json();
                        return responseJSON.generated_text;
                    },
                    timeoutMs,
                    "Raiden AI request"
                );
            });

            if (responseText) {
                return responseText;
            } else {
                throw new Error("Received empty response string");
            }
            
        } catch (error: any) {
            console.warn(`[raiden] Model ${model} failed: ${error.message}. Switching to next...`);
            lastError = error instanceof Error ? error : new Error(String(error));
            // Continue loop to fallback to next model
        }
    }

    throw new Error(`All fallback models failed. Last error: ${lastError?.message || "Unknown error"}`);
}

// ─────────────────────────────────────────────
// Streaming Client (Simulated)
// ─────────────────────────────────────────────

export async function raidenAIStream(
    text: string,
    newSession: boolean = false,
    type: AIRequestType = "chat",
    onChunk?: (chunk: string) => void
): Promise<ReadableStream<Uint8Array>> {
    // Fetch the complete response first using the core fail-safe client
    const fullResponse = await raidenAI(text, newSession, REQUEST_TIMEOUT_MS, type);

    const encoder = new TextEncoder();
    const words = fullResponse.split(" ");
    let wordIndex = 0;

    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            if (wordIndex >= words.length) {
                controller.close();
                return;
            }

            const chunk = words[wordIndex] + (wordIndex < words.length - 1 ? " " : "");
            controller.enqueue(encoder.encode(chunk));

            if (onChunk) onChunk(chunk);

            wordIndex++;
            await new Promise((resolve) => setTimeout(resolve, 18 + Math.random() * 12));
        },
    });
}

// ─────────────────────────────────────────────
// Agent Prompt Builder
// ─────────────────────────────────────────────

export function buildAgentPrompt(
    agentRole: string,
    code: string,
    instructions: string
): string {
    const template = `${agentRole}

## Code to Analyze
\`\`\`
${code}
\`\`\`

## Your Instructions
${instructions}

Provide a thorough, structured analysis. Include a confidence score (0-100) at the end.`;

    if (template.length <= 3000) {
        return template;
    }

    const overhead = template.length - code.length;
    const maxCodeLength = 3000 - overhead - 20;
    const truncatedCode = code.slice(0, maxCodeLength) + "\n[truncated]";

    return `${agentRole}

## Code to Analyze
\`\`\`
${truncatedCode}
\`\`\`

## Your Instructions
${instructions}

Provide a thorough, structured analysis. Include a confidence score (0-100) at the end.`;
}
