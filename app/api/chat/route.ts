/**
 * app/api/chat/route.ts — Streaming Chat API Endpoint
 *
 * ARCHITECTURE:
 * This endpoint runs on Vercel Edge Runtime for global distribution and
 * zero cold-start latency. It receives the full conversation history from
 * the client, sends it to Anthropic's Claude API with streaming enabled,
 * and forwards the response token-by-token via a Web ReadableStream.
 *
 * EDGE RUNTIME CHOICE:
 * Edge Runtime natively supports the Web Streams API (ReadableStream,
 * TextEncoder) without polyfills. This is critical for our streaming
 * architecture. Node.js runtime would require additional setup.
 *
 * SECURITY:
 * - API key stored server-side in .env.local — never exposed to client
 * - Input validation on message structure and count
 * - Graceful error handling for API unavailability
 */

import { anthropic, MODEL_ID, CHAT_MAX_TOKENS, MAX_CHAT_MESSAGES, CHAT_SYSTEM_PROMPT } from "@/lib/claude";
import type { ChatRequest, ChatMessage } from "@/lib/types";

/**
 * Force this route to run on Vercel Edge Runtime.
 * Edge Runtime provides:
 * - Zero cold-start latency (compared to ~250ms on Node.js serverless)
 * - Global distribution via Vercel's CDN edge nodes
 * - Native Web Streams API support for streaming responses
 * - 30-second execution time limit (important for long conversations)
 */
export const runtime = "edge";

/**
 * Validates and sanitizes the incoming chat request.
 * Returns the validated messages array or throws a descriptive error.
 */
function validateChatRequest(body: unknown): ChatMessage[] {
    // Type-check the request body structure
    if (!body || typeof body !== "object" || !("messages" in body)) {
        throw new Error("Request body must contain a 'messages' array");
    }

    const { messages } = body as ChatRequest;

    // Validate messages is a non-empty array
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error("Messages array must contain at least one message");
    }

    // Validate each message has the correct structure
    for (const msg of messages) {
        if (!msg.role || !msg.content) {
            throw new Error("Each message must have 'role' and 'content' fields");
        }
        if (msg.role !== "user" && msg.role !== "assistant") {
            throw new Error("Message role must be 'user' or 'assistant'");
        }
        if (typeof msg.content !== "string") {
            throw new Error("Message content must be a string");
        }
    }

    /**
     * COST CONTROL: Limit the number of messages sent to the API.
     * At ~500 tokens per message pair, 50 messages ≈ 25K context tokens.
     * This keeps costs reasonable while maintaining useful conversation depth.
     *
     * We take the LAST N messages to preserve the most recent context,
     * which is almost always more relevant than earlier messages.
     */
    const limitedMessages = messages.slice(-MAX_CHAT_MESSAGES);

    return limitedMessages;
}

/**
 * POST /api/chat — Handle streaming chat requests.
 *
 * Flow:
 * 1. Parse and validate the request body
 * 2. Send conversation history to Anthropic Claude with streaming enabled
 * 3. Forward each token as it arrives via a ReadableStream
 * 4. Handle errors gracefully at every stage
 */
export async function POST(request: Request): Promise<Response> {
    try {
        // ── Step 1: Parse and validate the request ──────────────────────
        const body: unknown = await request.json();
        const messages = validateChatRequest(body);

        // ── Step 2: Create a streaming request to Anthropic ─────────────
        /**
         * We use the Anthropic SDK's stream() method which returns an
         * async iterable. Each iteration yields a streaming event containing
         * a text delta (partial token). This is the same mechanism used by
         * ChatGPT, Claude.ai, and other streaming AI interfaces.
         */
        const stream = anthropic.messages.stream({
            model: MODEL_ID,
            max_tokens: CHAT_MAX_TOKENS,
            system: CHAT_SYSTEM_PROMPT,
            messages: messages.map((msg) => ({
                role: msg.role,
                content: msg.content,
            })),
        });

        // ── Step 3: Create a ReadableStream to forward tokens ───────────
        /**
         * We wrap the Anthropic stream in a standard Web ReadableStream.
         * This allows the response to be consumed by the frontend using
         * the standard Fetch API's response.body.getReader() pattern.
         *
         * TextEncoder converts string chunks to Uint8Array for the stream.
         */
        const encoder = new TextEncoder();

        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    /**
                     * Iterate through the Anthropic stream events.
                     * The 'text' event fires for each text delta (partial token).
                     * We encode each delta and enqueue it to the ReadableStream.
                     */
                    stream.on("text", (text) => {
                        controller.enqueue(encoder.encode(text));
                    });

                    /**
                     * Wait for the stream to fully complete.
                     * The finalMessage() call resolves when all tokens have been
                     * sent, giving us the complete message metadata.
                     */
                    await stream.finalMessage();

                    // Close the stream when all tokens have been sent
                    controller.close();
                } catch (streamError: unknown) {
                    /**
                     * STREAM FAILURE HANDLING:
                     * If the Anthropic stream fails mid-response (network error,
                     * API timeout, etc.), we close the stream gracefully.
                     * The frontend will display whatever partial content was
                     * already received, plus an error indicator.
                     */
                    const errorMessage =
                        streamError instanceof Error
                            ? streamError.message
                            : "Stream interrupted unexpectedly";

                    // Send the error as a final chunk so the frontend can detect it
                    controller.enqueue(
                        encoder.encode(`\n\n[Error: ${errorMessage}]`)
                    );
                    controller.close();
                }
            },
        });

        // ── Step 4: Return the streaming response ───────────────────────
        return new Response(readableStream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                /**
                 * Cache-Control: no-cache is critical for streaming.
                 * Without it, some CDNs or proxies will buffer the entire
                 * response before forwarding, defeating the purpose of streaming.
                 */
                "Cache-Control": "no-cache",
                /**
                 * X-Content-Type-Options: nosniff prevents browsers from
                 * MIME-sniffing the response, which could interfere with
                 * how the stream is processed.
                 */
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error: unknown) {
        /**
         * TOP-LEVEL ERROR HANDLING:
         * Catches errors from request parsing, API client initialization,
         * or any uncaught exception. Returns a JSON error response.
         */

        // Handle specific Anthropic API errors
        if (error instanceof Error) {
            // API key missing or invalid
            if (error.message.includes("API key") || error.message.includes("authentication")) {
                return new Response(
                    JSON.stringify({
                        error: "AI service configuration error. Please contact the administrator.",
                        code: "AUTH_ERROR",
                    }),
                    { status: 503, headers: { "Content-Type": "application/json" } }
                );
            }

            // Rate limiting
            if (error.message.includes("rate limit") || error.message.includes("429")) {
                return new Response(
                    JSON.stringify({
                        error: "AI service is temporarily busy. Please try again in a few seconds.",
                        code: "RATE_LIMITED",
                    }),
                    { status: 429, headers: { "Content-Type": "application/json" } }
                );
            }

            // Validation errors (from our validateChatRequest function)
            return new Response(
                JSON.stringify({ error: error.message, code: "VALIDATION_ERROR" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Catch-all for unknown errors
        return new Response(
            JSON.stringify({
                error: "An unexpected error occurred. Please try again.",
                code: "INTERNAL_ERROR",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
