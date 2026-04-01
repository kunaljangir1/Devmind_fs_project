/**
 * app/api/chat/route.ts — Streaming Chat API Endpoint (Raiden API)
 *
 * Receives the full conversation history from the client, builds a
 * structured prompt from the history, calls the Raiden AI API, and
 * returns a simulated streaming response (word-by-word typewriter).
 *
 * ARCHITECTURE:
 * - POST method accepts { messages, newSession } body
 * - Builds a single prompt from conversation history (last 10 messages)
 * - Prepends the DevMind system prompt for consistent persona
 * - Uses raidenAIStream() for simulated streaming response
 * - Returns ReadableStream with Content-Type: text/plain
 */

import { raidenAIStream } from "@/lib/raiden";
import { DEVMIND_SYSTEM_PROMPT, MAX_CHAT_MESSAGES } from "@/lib/config";

/**
 * Message interface matching the frontend contract.
 * Each message has a role (user or assistant) and text content.
 */
interface Message {
    role: "user" | "assistant";
    content: string;
}

/** Request body shape for the chat endpoint */
interface ChatRequestBody {
    messages: Message[];
    newSession?: boolean;
}

/**
 * Validates and parses the incoming chat request body.
 * Returns validated messages and newSession flag, or throws on invalid input.
 */
function validateRequest(body: unknown): { messages: Message[]; newSession: boolean } {
    if (!body || typeof body !== "object" || !("messages" in body)) {
        throw new Error("Request body must contain a 'messages' array");
    }

    const { messages, newSession } = body as ChatRequestBody;

    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error("Messages array must contain at least one message");
    }

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

    // Limit to last N messages to control prompt length
    const limitedMessages = messages.slice(-MAX_CHAT_MESSAGES);

    return {
        messages: limitedMessages,
        newSession: Boolean(newSession),
    };
}

/**
 * Builds a single prompt string from the conversation history.
 *
 * Format:
 *   [System prompt]
 *
 *   Previous conversation:
 *   User: [message]
 *   Assistant: [message]
 *   ...
 *
 *   Current question: [last user message]
 *
 * The last user message is separated as "Current question" to
 * clearly signal what the model should respond to.
 */
function buildChatPrompt(messages: Message[]): string {
    const parts: string[] = [DEVMIND_SYSTEM_PROMPT, ""];

    // All messages except the last user message form the history
    const history = messages.slice(0, -1);
    const currentMessage = messages[messages.length - 1];

    if (history.length > 0) {
        parts.push("Previous conversation:");
        for (const msg of history) {
            const role = msg.role === "user" ? "User" : "Assistant";
            parts.push(`${role}: ${msg.content}`);
        }
        parts.push("");
    }

    parts.push(`Current question: ${currentMessage.content}`);

    return parts.join("\n");
}

/**
 * POST /api/chat — Streaming chat endpoint using Raiden API.
 *
 * Flow:
 * 1. Parse and validate the request body
 * 2. Build a structured prompt from conversation history
 * 3. Call raidenAIStream() to get a simulated streaming response
 * 4. Pipe the stream back to the client
 */
export async function POST(request: Request): Promise<Response> {
    try {
        // Step 1: Parse and validate
        const body: unknown = await request.json();
        const { messages, newSession } = validateRequest(body);

        // Step 2: Build the prompt
        const prompt = buildChatPrompt(messages);

        // Step 3: Get streaming response from Raiden API
        const stream = await raidenAIStream(prompt, newSession);

        // Step 4: Return the stream
        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "An unexpected error occurred";

        // Determine status code based on error type
        let status = 500;
        if (message.includes("must contain") || message.includes("must have")) {
            status = 400;
        } else if (message.includes("timed out")) {
            status = 504;
        } else if (message.includes("rate limit") || message.includes("429")) {
            status = 429;
        }

        return new Response(
            JSON.stringify({ error: message, code: "API_ERROR" }),
            { status, headers: { "Content-Type": "application/json" } }
        );
    }
}
