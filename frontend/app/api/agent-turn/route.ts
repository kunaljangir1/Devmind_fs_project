/**
 * app/api/agent-turn/route.ts — Server-side Agent Turn Endpoint
 *
 * This route proxies the agent chat's AI call to the Raiden API server-side,
 * bypassing browser CORS restrictions that would block direct client calls.
 *
 * POST body: { prompt: string }
 * Response:  { rawText: string } — the raw Raiden AI response to be parsed by the client
 */

import { raidenAI } from "@/lib/raiden";
import { AGENT_TIMEOUT_MS } from "@/lib/config";

interface AgentTurnRequestBody {
    prompt: string;
}

export async function POST(request: Request): Promise<Response> {
    try {
        const body: unknown = await request.json();

        if (!body || typeof body !== "object" || !("prompt" in body)) {
            return new Response(
                JSON.stringify({ error: "Request body must contain a 'prompt' field" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const { prompt } = body as AgentTurnRequestBody;

        if (typeof prompt !== "string" || prompt.trim().length === 0) {
            return new Response(
                JSON.stringify({ error: "Prompt must be a non-empty string" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Call Raiden with agent-type model preferences and fail-safe fallback
        const rawText = await raidenAI(prompt, false, AGENT_TIMEOUT_MS, "agent");

        return new Response(JSON.stringify({ rawText }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "An unexpected error occurred";

        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
