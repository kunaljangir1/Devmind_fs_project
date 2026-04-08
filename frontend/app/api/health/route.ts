/**
 * app/api/health/route.ts — API Health Check Endpoint
 *
 * Makes a test call to the Raiden AI API and reports connectivity status.
 * Useful for debugging deployment issues and monitoring API availability.
 *
 * Response:
 *   200 → { status: "ok", api: "raiden", models: string[], latencyMs: number }
 *   503 → { status: "error", message: string }
 */

import { raidenAI, getAvailableModels } from "@/lib/raiden";

/**
 * GET /api/health — Check Raiden API connectivity.
 *
 * Sends a simple "ping" request to the Raiden API and measures
 * the round-trip time. Returns status, available models, and latency.
 */
export async function GET(): Promise<Response> {
    const startTime = Date.now();

    try {
        // Check model availability
        const models = await getAvailableModels();

        // Make a quick test call to Raiden
        await raidenAI("ping", false, 10_000, "chat");

        const latencyMs = Date.now() - startTime;

        return new Response(
            JSON.stringify({
                status: "ok",
                api: "raiden",
                modelsAvailable: models.length,
                latencyMs,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error: unknown) {
        const latencyMs = Date.now() - startTime;
        const message =
            error instanceof Error ? error.message : "Unknown error";

        return new Response(
            JSON.stringify({
                status: "error",
                message: `Health check failed: ${message}`,
                latencyMs,
            }),
            { status: 503, headers: { "Content-Type": "application/json" } }
        );
    }
}
