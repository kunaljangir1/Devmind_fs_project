/**
 * app/api/agents/route.ts — Multi-Agent Code Analysis Endpoint with SSE Streaming
 *
 * ARCHITECTURE:
 * This is the most complex endpoint in DevMind. It implements:
 *
 * 1. PARALLEL AGENT DISPATCH — Four specialized Claude agents run simultaneously
 *    via Promise.allSettled() for error isolation (not Promise.all, which would
 *    fail-fast on any rejection).
 *
 * 2. SSE STREAMING — Each agent streams its results independently to the client
 *    using Server-Sent Events. The frontend displays each agent's response
 *    token-by-token as it arrives, rather than waiting for all agents to complete.
 *
 * 3. PER-AGENT TIMEOUT — Each agent has a 20-second timeout. If an agent exceeds
 *    this limit, it fails gracefully while other agents continue.
 *
 * 4. TOOL USE — The Security Auditor agent can invoke a CVE database lookup tool
 *    during its analysis, demonstrating Claude's function calling capability.
 *
 * 5. ERROR ISOLATION — If one agent fails (timeout, API error, etc.), the others
 *    still return their results. The failed agent shows an error state in the UI.
 *
 * EDGE RUNTIME CONSTRAINTS:
 * - 30-second execution time limit on Vercel (we set per-agent timeout to 20s)
 * - No access to filesystem or native Node.js modules
 * - Limited memory (~128MB) — we validate input size upfront
 */

import {
    anthropic,
    MODEL_ID,
    AGENT_MAX_TOKENS,
    AGENT_TIMEOUT_MS,
    MAX_CODE_LENGTH,
    AGENT_PROMPTS,
    AGENT_METADATA,
    CVE_LOOKUP_TOOL,
    CVE_DATABASE,
} from "@/lib/claude";
import type { AgentId, AgentResult, AgentRequest } from "@/lib/types";

/** Force Edge Runtime for global distribution and native Web Streams support */
export const runtime = "edge";

// ─────────────────────────────────────────────
// Input Validation
// ─────────────────────────────────────────────

/**
 * Validates the incoming code analysis request.
 * Checks for: presence, type, length, and non-empty content.
 */
function validateAgentRequest(body: unknown): string {
    if (!body || typeof body !== "object" || !("code" in body)) {
        throw new Error("Request body must contain a 'code' field");
    }

    const { code } = body as AgentRequest;

    if (typeof code !== "string") {
        throw new Error("Code must be a string");
    }

    const trimmedCode = code.trim();

    if (trimmedCode.length === 0) {
        throw new Error("Code cannot be empty");
    }

    if (trimmedCode.length > MAX_CODE_LENGTH) {
        throw new Error(
            `Code exceeds maximum length of ${MAX_CODE_LENGTH} characters (submitted: ${trimmedCode.length})`
        );
    }

    return trimmedCode;
}

// ─────────────────────────────────────────────
// CVE Tool Handling
// ─────────────────────────────────────────────

/**
 * Handles tool calls from the Security Auditor agent.
 * When Claude decides to call the check_cve_database tool, this function
 * looks up the vulnerability in our simulated CVE database and returns
 * the results in the format Claude expects.
 *
 * PRODUCTION NOTE: In a real system, this would make an HTTP request to
 * the NIST NVD API (https://services.nvd.nist.gov/rest/json/cves/2.0)
 * or the MITRE CVE API. We simulate it here for demonstration.
 */
function handleCVEToolCall(vulnerabilityName: string): string {
    const normalizedName = vulnerabilityName.toLowerCase().trim();

    // Search for matching CVE entries
    const matchingEntries = CVE_DATABASE[normalizedName];

    if (matchingEntries && matchingEntries.length > 0) {
        const results = matchingEntries.map((entry) => ({
            cve_id: entry.cve_id,
            description: entry.description,
            cvss_score: entry.cvss_score,
            reference_url: entry.reference_url,
        }));
        return JSON.stringify({
            found: true,
            count: results.length,
            results,
        });
    }

    // Try partial matching for broader coverage
    const partialMatch = Object.entries(CVE_DATABASE).find(([key]) =>
        normalizedName.includes(key) || key.includes(normalizedName)
    );

    if (partialMatch) {
        return JSON.stringify({
            found: true,
            count: partialMatch[1].length,
            results: partialMatch[1],
        });
    }

    return JSON.stringify({
        found: false,
        count: 0,
        results: [],
        message: `No CVE entries found for "${vulnerabilityName}". This may be a novel vulnerability or use a different classification.`,
    });
}

// ─────────────────────────────────────────────
// Agent Execution with Tool Use
// ─────────────────────────────────────────────

/**
 * Runs a single agent against the submitted code.
 * Supports tool use for the Security Auditor agent.
 *
 * This function implements a tool-use loop:
 * 1. Send the initial prompt to Claude
 * 2. If Claude responds with a tool_use block, execute the tool
 * 3. Send the tool result back to Claude
 * 4. Claude produces its final analysis incorporating the tool result
 *
 * @param agentId - Which agent to run
 * @param code - The code to analyze
 * @param onChunk - Callback for streaming partial results
 * @returns Complete agent result with analysis text and metadata
 */
async function runAgent(
    agentId: AgentId,
    code: string,
    onChunk: (agentId: AgentId, chunk: string) => void
): Promise<AgentResult> {
    const startTime = Date.now();
    const metadata = AGENT_METADATA[agentId];

    /**
     * Determine if this agent should have tool access.
     * Only the Security Auditor gets the CVE lookup tool.
     */
    const tools = agentId === "security" ? [CVE_LOOKUP_TOOL] : undefined;

    /**
     * Initial message to the agent: submit the code for analysis.
     * The system prompt (from AGENT_PROMPTS) defines the agent's role.
     */
    type MessageParam = { role: "user" | "assistant"; content: string | Array<{ type: "tool_result"; tool_use_id: string; content: string }> };
    const conversationMessages: MessageParam[] = [
        {
            role: "user" as const,
            content: `Please analyze the following code:\n\n\`\`\`\n${code}\n\`\`\``,
        },
    ];

    let fullAnalysis = "";

    /**
     * TOOL USE LOOP:
     * Claude may respond with a tool_use request instead of (or in addition to)
     * text content. We need to handle this iteratively:
     *
     * Turn 1: Claude analyzes code → may request tool_use
     * Turn 2: We provide tool_result → Claude produces final analysis
     *
     * Maximum 2 iterations to prevent infinite loops.
     */
    let iterations = 0;
    const maxIterations = 3;

    while (iterations < maxIterations) {
        iterations++;

        // Create the message request with streaming
        const stream = anthropic.messages.stream({
            model: MODEL_ID,
            max_tokens: AGENT_MAX_TOKENS,
            system: AGENT_PROMPTS[agentId],
            messages: conversationMessages,
            ...(tools ? { tools } : {}),
        });

        // Collect text chunks for streaming to the client
        let currentText = "";
        let hasToolUse = false;
        let toolUseId = "";
        let toolInput: Record<string, string> = {};

        stream.on("text", (text) => {
            currentText += text;
            fullAnalysis += text;
            onChunk(agentId, text);
        });

        // Wait for the full message to determine if there's a tool call
        const message = await stream.finalMessage();

        // Check if Claude wants to use a tool
        for (const block of message.content) {
            if (block.type === "tool_use") {
                hasToolUse = true;
                toolUseId = block.id;
                toolInput = block.input as Record<string, string>;
                break;
            }
        }

        if (!hasToolUse || agentId !== "security") {
            // No tool use needed — we have the final analysis
            break;
        }

        /**
         * TOOL USE HANDLING:
         * Claude requested a tool call. We execute the tool locally,
         * then send the result back to Claude for incorporation into
         * the final analysis.
         */
        const toolResultContent = handleCVEToolCall(
            toolInput.vulnerability_name || ""
        );

        // Add assistant's response (with tool use) to conversation
        conversationMessages.push({
            role: "assistant" as const,
            content: currentText, // preserve the text Claude already generated
        });

        // Add the tool result for the next turn
        conversationMessages.push({
            role: "user" as const,
            content: [
                {
                    type: "tool_result" as const,
                    tool_use_id: toolUseId,
                    content: toolResultContent,
                },
            ],
        });

        onChunk(agentId, "\n\n📋 *CVE database consulted. Incorporating findings...*\n\n");
        fullAnalysis += "\n\n📋 *CVE database consulted. Incorporating findings...*\n\n";
    }

    const executionTimeMs = Date.now() - startTime;

    /**
     * Extract a confidence score from the analysis text.
     * The agent prompt asks for a confidence score in the output.
     * We parse it out for the structured response.
     */
    const confidenceMatch = fullAnalysis.match(/confidence\s*(?:score)?[:\s]*(\d{1,3})/i);
    const confidenceScore = confidenceMatch
        ? Math.min(100, Math.max(0, parseInt(confidenceMatch[1], 10)))
        : 75; // default confidence if not explicitly stated

    return {
        agentId,
        agentName: metadata.name,
        emoji: metadata.emoji,
        status: "complete",
        analysis: fullAnalysis,
        findings: [], // Findings are extracted from the analysis text by the frontend
        confidenceScore,
        executionTimeMs,
    };
}

// ─────────────────────────────────────────────
// Timeout Wrapper
// ─────────────────────────────────────────────

/**
 * Wraps a promise with a timeout.
 * If the promise doesn't resolve within the specified time,
 * it rejects with a timeout error. The original promise continues
 * running (we can't cancel an Anthropic API call), but its result
 * is ignored.
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param agentId - Agent identifier for error messages
 */
function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    agentId: AgentId
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Agent "${agentId}" timed out after ${timeoutMs / 1000} seconds`));
        }, timeoutMs);

        promise
            .then((result) => {
                clearTimeout(timer);
                resolve(result);
            })
            .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
    });
}

// ─────────────────────────────────────────────
// SSE Stream Helpers
// ─────────────────────────────────────────────

/**
 * Formats data as a Server-Sent Event string.
 * SSE format: "event: <type>\ndata: <json>\n\n"
 *
 * The double newline at the end is required by the SSE spec to
 * delimit events. The client uses EventSource or a manual reader
 * to parse these events.
 */
function formatSSE(eventType: string, data: Record<string, unknown>): string {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─────────────────────────────────────────────
// Main POST Handler
// ─────────────────────────────────────────────

/**
 * POST /api/agents — Handle parallel multi-agent code analysis with SSE streaming.
 *
 * Flow:
 * 1. Validate the code input
 * 2. Open an SSE stream to the client
 * 3. Dispatch all 4 agents in parallel with timeout wrappers
 * 4. Stream each agent's tokens to the client as they arrive
 * 5. Send completion events as each agent finishes
 * 6. Close the stream when all agents are done
 */
export async function POST(request: Request): Promise<Response> {
    try {
        // ── Step 1: Validate input ──────────────────────────────────────
        const body: unknown = await request.json();
        const code = validateAgentRequest(body);

        // ── Step 2: Set up SSE stream ───────────────────────────────────
        const encoder = new TextEncoder();
        const agentIds: AgentId[] = ["complexity", "security", "refactor", "documentation"];

        const readableStream = new ReadableStream({
            async start(controller) {
                /**
                 * Send initial "agent-start" events for all agents.
                 * This lets the frontend immediately show all agent cards
                 * in a "pending" state before any analysis begins.
                 */
                for (const agentId of agentIds) {
                    const metadata = AGENT_METADATA[agentId];
                    controller.enqueue(
                        encoder.encode(
                            formatSSE("agent-start", {
                                agentId,
                                agentName: metadata.name,
                                emoji: metadata.emoji,
                                status: "running",
                            })
                        )
                    );
                }

                /**
                 * Chunk callback: streams partial text from each agent
                 * to the client as it arrives. Each chunk is tagged with
                 * its agentId so the frontend knows which card to update.
                 */
                const onChunk = (agentId: AgentId, chunk: string) => {
                    try {
                        controller.enqueue(
                            encoder.encode(
                                formatSSE("agent-chunk", { agentId, chunk })
                            )
                        );
                    } catch {
                        // Stream may have been closed by the client — ignore
                    }
                };

                // ── Step 3: Dispatch all agents in parallel ─────────────────
                /**
                 * Promise.allSettled() is used instead of Promise.all() for
                 * ERROR ISOLATION: if one agent fails (timeout, API error),
                 * the others continue and return their results. With Promise.all(),
                 * a single agent failure would reject the entire batch.
                 */
                const agentPromises = agentIds.map((agentId) =>
                    withTimeout(
                        runAgent(agentId, code, onChunk),
                        AGENT_TIMEOUT_MS,
                        agentId
                    )
                );

                const results = await Promise.allSettled(agentPromises);

                // ── Step 4: Send completion events for each agent ───────────
                for (let i = 0; i < results.length; i++) {
                    const result = results[i];
                    const agentId = agentIds[i];
                    const metadata = AGENT_METADATA[agentId];

                    if (result.status === "fulfilled") {
                        // Agent completed successfully
                        controller.enqueue(
                            encoder.encode(
                                formatSSE("agent-complete", {
                                    ...result.value,
                                    status: "complete",
                                })
                            )
                        );
                    } else {
                        // Agent failed — send error event with details
                        const errorResult: AgentResult = {
                            agentId,
                            agentName: metadata.name,
                            emoji: metadata.emoji,
                            status: "failed",
                            analysis: "",
                            findings: [],
                            confidenceScore: 0,
                            error: result.reason instanceof Error
                                ? result.reason.message
                                : "Unknown error occurred",
                            executionTimeMs: AGENT_TIMEOUT_MS,
                        };

                        controller.enqueue(
                            encoder.encode(
                                formatSSE("agent-error", errorResult)
                            )
                        );
                    }
                }

                // ── Step 5: Send final "all-complete" event ─────────────────
                controller.enqueue(
                    encoder.encode(
                        formatSSE("all-complete", {
                            totalAgents: agentIds.length,
                            completedSuccessfully: results.filter(
                                (r) => r.status === "fulfilled"
                            ).length,
                            failed: results.filter((r) => r.status === "rejected").length,
                        })
                    )
                );

                controller.close();
            },
        });

        // ── Step 6: Return the SSE response ─────────────────────────────
        return new Response(readableStream, {
            headers: {
                /**
                 * Content-Type: text/event-stream is the MIME type for SSE.
                 * This tells the client to parse the response as a stream
                 * of server-sent events rather than a regular HTTP response.
                 */
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error: unknown) {
        // Handle validation and initialization errors as JSON
        const message =
            error instanceof Error ? error.message : "An unexpected error occurred";

        const status =
            error instanceof Error && error.message.includes("exceeds maximum")
                ? 413 // Payload Too Large
                : error instanceof Error && error.message.includes("must contain")
                    ? 400 // Bad Request
                    : 500; // Internal Server Error

        return new Response(
            JSON.stringify({ error: message, code: "VALIDATION_ERROR" }),
            { status, headers: { "Content-Type": "application/json" } }
        );
    }
}
