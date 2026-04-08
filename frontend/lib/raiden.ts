/**
 * lib/raiden.ts — Typed API client for the Raiden AI API.
 *
 * This module enables direct HTTP calls to the custom Raiden API endpoint,
 * including fail-safe mechanisms for automated model selection and fallback logic.
 *
 * KEY CONSTRAINT: The Raiden API only supports GET requests with query parameters.
 * For large prompts (agent scenarios w/ VFS), we compress the prompt aggressively
 * and split into multiple exchanges if needed.
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

    // Fallback if the endpoint is down — updated to match current available models
    return ["gpt-5.2", "gpt-5", "gpt-4o-latest", "claude-sonnet-4", "gemini-2.5-pro", "deepseek-r1", "deepseek-v3.1"];
}

/**
 * Determines the preferred list of models for the given interaction type.
 * Updated to prioritize the best-performing models currently available.
 */
function getPreferredModelList(type: AIRequestType, available: string[]): string[] {
    let idealOrder: string[] = [];
    if (type === "chat") {
        idealOrder = [
            "gpt-4o-latest",
            "gpt-5",
            "gpt-5.2",
            "claude-sonnet-4",
            "gemini-2.5-pro",
            "gemini-2.5-flash",
            "deepseek-v3.1",
            "deepseek-v3",
            "o3-mini",
        ];
    } else {
        // Agent type — needs models good at structured JSON output
        idealOrder = [
            "gpt-4o-latest",
            "gpt-5",
            "gpt-5.2",
            "claude-sonnet-4",
            "deepseek-r1",
            "gemini-2.5-pro",
            "o3-mini",
            "deepseek-v3.1",
        ];
    }

    // Filter available models that match our ideal order
    const preferredAvailable = idealOrder.filter(m => available.includes(m));

    // Fallback: in case all ideal order models fail, append the rest of available models.
    const remaining = available.filter(m => !preferredAvailable.includes(m));

    return [...preferredAvailable, ...remaining];
}

// ─────────────────────────────────────────────
// Prompt Compression for URL-based API
// ─────────────────────────────────────────────

/**
 * Compresses a prompt to fit within the maximum URL length constraint.
 * Uses progressive strategies:
 * 1. Remove excessive whitespace/blank lines
 * 2. Truncate code blocks to summaries
 * 3. Hard-truncate from the middle if still too long
 */
function compressPromptForURL(text: string, maxLength: number): string {
    // Step 1: Normalize whitespace — collapse multiple blank lines, trim line endings
    let compressed = text
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]+$/gm, "")
        .replace(/^[ \t]+/gm, (match) => match.length > 4 ? "    " : match);

    if (compressed.length <= maxLength) return compressed;

    // Step 2: Truncate long code blocks (keep first and last 15 lines of each)
    compressed = compressed.replace(/```[\s\S]*?```/g, (block) => {
        if (block.length <= 600) return block;
        const lines = block.split("\n");
        const header = lines[0]; // ```lang
        if (lines.length <= 30) return block;
        const kept = [
            header,
            ...lines.slice(1, 16),
            "// ... [truncated] ...",
            ...lines.slice(-15, -1),
            "```"
        ];
        return kept.join("\n");
    });

    if (compressed.length <= maxLength) return compressed;

    // Step 3: Hard truncate — keep beginning (system prompt & instructions) and end (user request)
    const halfLen = Math.floor(maxLength / 2) - 30;
    compressed = compressed.slice(0, halfLen) +
        "\n\n[...CONTEXT TRUNCATED FOR LENGTH...]\n\n" +
        compressed.slice(-halfLen);

    return compressed;
}

// ─────────────────────────────────────────────
// Core API Client
// ─────────────────────────────────────────────

/**
 * Makes a single request to the Raiden AI API, with fail-safe fallback.
 * Uses GET with query parameters (API only supports GET).
 * Automatically compresses prompts that would exceed URL length limits.
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
                        url.searchParams.set("model", model);
                        url.searchParams.set("new_session", String(newSession));

                        // Calculate available space for text after other params
                        const baseUrlLen = url.toString().length + "&text=".length;
                        const maxTextLen = MAX_URL_LENGTH - baseUrlLen - 200; // 200 char safety margin for encoding

                        // Compress prompt if needed
                        const promptText = text.length > maxTextLen
                            ? compressPromptForURL(text, maxTextLen)
                            : text;

                        url.searchParams.set("text", promptText);

                        const urlString = url.toString();
                        if (urlString.length > MAX_URL_LENGTH) {
                            // Final safety: if URL is STILL too long after compression, hard-truncate
                            const overhead = urlString.length - promptText.length;
                            const safeLen = MAX_URL_LENGTH - overhead - 100;
                            const truncated = promptText.slice(0, safeLen);
                            url.searchParams.set("text", truncated);
                        }

                        console.log(`[raiden] URL length: ${url.toString().length} chars (prompt: ${url.searchParams.get("text")?.length} chars)`);

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

                        if (!responseJSON.success) {
                            throw new Error(`Raiden returned success=false: ${responseJSON.message || "Unknown"}`);
                        }

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
