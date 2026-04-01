/**
 * lib/raiden.ts — Typed API client for the Raiden AI API.
 *
 * This module replaces the Anthropic SDK with direct HTTP calls to
 * the custom Raiden API endpoint. All AI calls in DevMind —
 * chat and all 4 agents — go through this client.
 *
 * API Spec:
 *   URL: https://api.raiden.ovh/ai/generate
 *   Method: GET
 *   Query Params:
 *     - text (string, required) — the prompt
 *     - model (string, required) — AI model name
 *     - new_session (boolean) — true to start fresh context
 *
 * IMPORTANT: Uses url.searchParams.set() for URL-safe encoding
 * (never manual string concatenation).
 */

import {
    RAIDEN_BASE_URL,
    RAIDEN_MODEL,
    REQUEST_TIMEOUT_MS,
    MAX_URL_LENGTH,
} from "./config";
import { withTimeout, withRetry, RaidenError } from "./retry";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** Raw response from the Raiden API */
export interface RaidenResponse {
    /** The text response from the AI model */
    text: string;
    /** HTTP status code */
    status: number;
}

// ─────────────────────────────────────────────
// Core API Client
// ─────────────────────────────────────────────

/**
 * Makes a single request to the Raiden AI API.
 *
 * Constructs the URL using the URL API for safe encoding, sends a GET
 * request, and returns the response text. Includes timeout protection
 * and retry logic for transient failures.
 *
 * @param text - The prompt text to send to the AI model
 * @param newSession - If true, starts a fresh conversation context (default: false)
 * @param timeoutMs - Request timeout in milliseconds (default: 30000)
 * @returns The AI model's text response
 * @throws RaidenError on HTTP errors (4xx, 5xx)
 * @throws TimeoutError if the request exceeds timeoutMs
 *
 * @example
 * const answer = await raidenAI("Explain Big O notation");
 * console.log(answer);
 */
export async function raidenAI(
    text: string,
    newSession: boolean = false,
    timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<string> {
    return withRetry(async () => {
        return withTimeout(
            async (signal: AbortSignal) => {
                // Build URL using the URL API — searchParams.set() auto-encodes
                const url = new URL(RAIDEN_BASE_URL);
                url.searchParams.set("text", text);
                url.searchParams.set("model", RAIDEN_MODEL);
                url.searchParams.set("new_session", String(newSession));

                // Check URL length — truncate prompt if too long
                const urlString = url.toString();
                if (urlString.length > MAX_URL_LENGTH) {
                    // Truncate the text parameter to fit within limits
                    const overhead = urlString.length - text.length;
                    const maxTextLength = MAX_URL_LENGTH - overhead - 20; // 20 chars safety margin
                    const truncatedText = text.slice(0, maxTextLength) + "\n[truncated]";
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
                console.log(responseJSON.generated_text);
                const responseText = responseJSON.generated_text;
                return responseText;
            },
            timeoutMs,
            "Raiden AI request"
        );
    });
}

// ─────────────────────────────────────────────
// Streaming Client (Simulated)
// ─────────────────────────────────────────────

/**
 * Simulates token-by-token streaming from the Raiden API response.
 *
 * Since the Raiden API returns a complete response (not a stream),
 * this function fetches the full response, then yields words one at a
 * time with small delays to create a typewriter effect in the UI.
 * This matches the UX of truly streamed responses from ChatGPT/Claude.
 *
 * @param text - The prompt text to send
 * @param newSession - If true, starts a fresh conversation context
 * @param onChunk - Callback invoked for each word chunk as it's "streamed"
 * @returns A ReadableStream that yields text chunks with controlled timing
 *
 * @example
 * const stream = await raidenAIStream("Explain recursion", false, (chunk) => {
 *   process.stdout.write(chunk);
 * });
 */
export async function raidenAIStream(
    text: string,
    newSession: boolean = false,
    onChunk?: (chunk: string) => void
): Promise<ReadableStream<Uint8Array>> {
    // Fetch the complete response first
    const fullResponse = await raidenAI(text, newSession);

    // Create a ReadableStream that simulates word-by-word streaming
    const encoder = new TextEncoder();
    const words = fullResponse.split(" ");
    let wordIndex = 0;

    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            if (wordIndex >= words.length) {
                controller.close();
                return;
            }

            // Build the chunk: word + space (except for the last word)
            const chunk =
                words[wordIndex] + (wordIndex < words.length - 1 ? " " : "");

            // Encode and enqueue the chunk
            controller.enqueue(encoder.encode(chunk));

            // Invoke the callback if provided
            if (onChunk) {
                onChunk(chunk);
            }

            wordIndex++;

            // Delay between words for typewriter effect (18-30ms per word)
            await new Promise((resolve) =>
                setTimeout(resolve, 18 + Math.random() * 12)
            );
        },
    });
}

// ─────────────────────────────────────────────
// Agent Prompt Builder
// ─────────────────────────────────────────────

/**
 * Builds a structured prompt string for an agent analysis request.
 *
 * Combines the agent's role definition, the code to analyze, and
 * specific analysis instructions into a single well-formatted prompt.
 * If the combined prompt exceeds the max length, the code portion
 * is truncated with a [truncated] marker.
 *
 * @param agentRole - The agent's role description (e.g., "You are a security auditor")
 * @param code - The source code to analyze
 * @param instructions - Specific analysis instructions for this agent
 * @returns A formatted prompt string ready for the API
 *
 * @example
 * const prompt = buildAgentPrompt(
 *   "You are a complexity analyst.",
 *   "function fib(n) { return n <= 1 ? n : fib(n-1) + fib(n-2); }",
 *   "Analyze the time and space complexity using Big O notation."
 * );
 */
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

    // If the prompt is within limits, return as-is
    if (template.length <= 3000) {
        return template;
    }

    // Truncate the code to fit within the prompt length limit
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
