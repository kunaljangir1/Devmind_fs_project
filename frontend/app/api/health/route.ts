/**
 * app/api/health/route.ts — API Health Check Endpoint
 *
 * Makes a test call to the Raiden AI API and reports connectivity status.
 * Useful for debugging deployment issues and monitoring API availability.
 *
 * Response:
 *   200 → { status: "ok", model: "claude-sonnet-4", latencyMs: number }
 *   503 → { status: "error", message: string }
 */

import { RAIDEN_BASE_URL, RAIDEN_MODEL } from "@/lib/config";

/**
 * GET /api/health — Check Raiden API connectivity.
 *
 * Sends a simple "ping" request to the Raiden API and measures
 * the round-trip time. Returns status, model name, and latency.
 */
export async function GET(): Promise<Response> {
    const startTime = Date.now();

    try {
        // Build test URL
        const url = new URL(RAIDEN_BASE_URL);
        url.searchParams.set("text", "ping");
        url.searchParams.set("model", RAIDEN_MODEL);
        url.searchParams.set("new_session", "false");

        // Make test request with 10-second timeout
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);

        const response = await fetch(url.toString(), {
            method: "GET",
            signal: controller.signal,
        });

        clearTimeout(timer);

        const latencyMs = Date.now() - startTime;

        if (!response.ok) {
            return new Response(
                JSON.stringify({
                    status: "error",
                    message: `Raiden API returned HTTP ${response.status}`,
                    latencyMs,
                }),
                { status: 503, headers: { "Content-Type": "application/json" } }
            );
        }

        // Read response to ensure full round-trip
        await response.text();

        return new Response(
            JSON.stringify({
                status: "ok",
                model: RAIDEN_MODEL,
                latencyMs,
                apiUrl: RAIDEN_BASE_URL,
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
