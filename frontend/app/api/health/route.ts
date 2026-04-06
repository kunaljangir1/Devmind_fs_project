/**
 * app/api/health/route.ts — API Health Check Endpoint
 *
 * Makes a test call to the Gemini AI API and reports connectivity status.
 * Useful for debugging deployment issues and monitoring API availability.
 *
 * Response:
 *   200 → { status: "ok", model: "gemini-2.5-flash-lite", latencyMs: number }
 *   503 → { status: "error", message: string }
 */

// ── Old Raiden import (commented out) ──
// import { RAIDEN_BASE_URL, RAIDEN_MODEL } from "@/lib/config";

// ── New Gemini import ──
import { geminiAI } from "@/lib/gemini";

/**
 * GET /api/health — Check Gemini API connectivity.
 *
 * Sends a simple "ping" request to the Gemini API and measures
 * the round-trip time. Returns status, model name, and latency.
 */
export async function GET(): Promise<Response> {
    const startTime = Date.now();

    try {
        // Make a quick test call to Gemini
        await geminiAI("ping");

        const latencyMs = Date.now() - startTime;

        return new Response(
            JSON.stringify({
                status: "ok",
                model: "gemini-2.5-flash-lite",
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
