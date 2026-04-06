/**
 * lib/gemini.ts — Typed API client for Google Gemini AI.
 *
 * This module replaces the Raiden API client with the Google Gemini SDK.
 * All AI calls in DevMind — chat and all 4 agents — go through this client.
 *
 * Uses the @google/genai SDK with the Gemini 2.5 Flash-Lite model.
 */

import { GoogleGenAI } from "@google/genai";

// ─────────────────────────────────────────────
// Client Initialization
// ─────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.warn(
        "[gemini] GEMINI_API_KEY is not set. AI calls will fail at runtime."
    );
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || "" });

/** Model to use for all Gemini API calls */
const GEMINI_MODEL = "gemini-2.5-flash-lite";

// ─────────────────────────────────────────────
// Core API Client
// ─────────────────────────────────────────────

/**
 * Makes a single request to the Gemini AI API.
 *
 * @param text - The prompt text to send to the AI model
 * @returns The AI model's text response
 * @throws Error on API failures
 *
 * @example
 * const answer = await geminiAI("Explain Big O notation");
 * console.log(answer);
 */
export async function geminiAI(text: string): Promise<string> {
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: text,
        });

        const result = response.text;

        if (!result) {
            throw new Error("Gemini API returned empty response");
        }

        return result;
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Unknown Gemini API error";
        console.error(`[gemini] API error: ${message}`);
        throw new Error(`Gemini API error: ${message}`);
    }
}

// ─────────────────────────────────────────────
// Streaming Client (Simulated)
// ─────────────────────────────────────────────

/**
 * Simulates token-by-token streaming from the Gemini API response.
 *
 * Since we're using generateContent (non-streaming), this function
 * fetches the full response, then yields words one at a time with
 * small delays to create a typewriter effect in the UI.
 *
 * @param text - The prompt text to send
 * @param onChunk - Callback invoked for each word chunk as it's "streamed"
 * @returns A ReadableStream that yields text chunks with controlled timing
 */
export async function geminiAIStream(
    text: string,
    onChunk?: (chunk: string) => void
): Promise<ReadableStream<Uint8Array>> {
    // Fetch the complete response first
    const fullResponse = await geminiAI(text);

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
 *
 * @param agentRole - The agent's role description
 * @param code - The source code to analyze
 * @param instructions - Specific analysis instructions for this agent
 * @returns A formatted prompt string ready for the API
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
