/**
 * app/api/agents/route.ts — Multi-Agent Code Analysis Endpoint (Gemini AI)
 *
 * Dispatches 4 specialized AI agents in TRUE PARALLEL via Promise.allSettled().
 * Each agent gets its own prompt, makes an independent call to the Gemini API,
 * and handles failures independently (error isolation).
 *
 * Agents:
 *   1. Complexity Analyst — Big O analysis, bottleneck detection
 *   2. Security Auditor — OWASP vulnerabilities, injection risks
 *   3. Refactor Advisor — DRY, design patterns, modern idioms
 *   4. Documentation Generator — JSDoc, README, usage examples
 *
 * Response Shape:
 * {
 *   agents: [{ id, name, emoji, status, result, durationMs }],
 *   totalDurationMs: number
 * }
 */

// ── New Raiden imports ──
import { raidenAI, buildAgentPrompt } from "@/lib/raiden";
// import { withTimeout, TimeoutError } from "@/lib/retry";

// ── Old Gemini imports (commented out) ──
// import { geminiAI, buildAgentPrompt } from "@/lib/gemini";
import { MAX_CODE_LENGTH, AGENT_TIMEOUT_MS } from "@/lib/config";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type AgentId = "complexity" | "security" | "refactor" | "docs";

interface AgentDefinition {
    id: AgentId;
    name: string;
    emoji: string;
    role: string;
    instructions: string;
}

interface AgentResponse {
    id: AgentId;
    name: string;
    emoji: string;
    status: "success" | "error";
    result: string;
    durationMs: number;
    error?: string;
}

interface AgentsResponseBody {
    agents: AgentResponse[];
    totalDurationMs: number;
}

// ─────────────────────────────────────────────
// Agent Definitions
// ─────────────────────────────────────────────

const AGENTS: AgentDefinition[] = [
    {
        id: "complexity",
        name: "Complexity Analyst",
        emoji: "📊",
        role: "You are a computer science complexity analyst.",
        instructions:
            "Analyze the time complexity (Big O) and space complexity of this code. " +
            "Identify bottlenecks, nested loops, and recursive calls. " +
            "Provide specific Big O notation for each function. " +
            "Suggest optimizations with before/after complexity comparisons. " +
            "Structure your output with these sections: " +
            "Overall Complexity, Function-by-Function Analysis, Bottlenecks Identified, " +
            "Optimization Recommendations, and a Confidence Score (0-100).",
    },
    {
        id: "security",
        name: "Security Auditor",
        emoji: "🔐",
        role: "You are a senior application security engineer.",
        instructions:
            "Scan this code for security vulnerabilities. Check for: " +
            "SQL injection, XSS risks, insecure data handling, hardcoded secrets, " +
            "improper input validation, and OWASP Top 10 issues. " +
            "Rate each finding as [CRITICAL], [HIGH], [MEDIUM], [LOW], or [INFO]. " +
            "For each finding include: severity, description, location, impact, and remediation. " +
            "End with overall risk assessment and a Confidence Score (0-100). " +
            "Include disclaimer that AI security analysis is advisory.",
    },
    {
        id: "refactor",
        name: "Refactor Advisor",
        emoji: "✨",
        role: "You are a clean code expert and software architect.",
        instructions:
            "Suggest concrete refactoring improvements for this code. " +
            "Focus on: DRY violations, naming conventions, function length, " +
            "single responsibility principle, and modern language idioms. " +
            "Show before/after examples where possible. " +
            "Identify applicable design patterns (Strategy, Factory, Observer, etc.). " +
            "Structure: Code Quality Summary, Refactoring Opportunities, " +
            "Modern Idioms, and a Confidence Score (0-100).",
    },
    {
        id: "docs",
        name: "Documentation Generator",
        emoji: "📝",
        role: "You are a technical documentation specialist.",
        instructions:
            "Generate complete documentation for this code including: " +
            "JSDoc/docstring comments for every function, parameter descriptions with types, " +
            "return value descriptions, usage examples with sample inputs and outputs, " +
            "and a brief README section describing what this code does. " +
            "Structure: Code Overview, Function Documentation, Usage Examples, " +
            "Type Definitions, and a Confidence Score (0-100).",
    },
];

// ─────────────────────────────────────────────
// Input Validation
// ─────────────────────────────────────────────

function validateRequest(body: unknown): string {
    if (!body || typeof body !== "object" || !("code" in body)) {
        throw new Error("Request body must contain a 'code' field");
    }

    const { code } = body as { code: string };

    if (typeof code !== "string") {
        throw new Error("Code must be a string");
    }

    const trimmed = code.trim();

    if (trimmed.length === 0) {
        throw new Error("Code cannot be empty");
    }

    if (trimmed.length > MAX_CODE_LENGTH) {
        throw new Error(
            `Code exceeds maximum length of ${MAX_CODE_LENGTH} characters (submitted: ${trimmed.length})`
        );
    }

    return trimmed;
}

// ─────────────────────────────────────────────
// Single Agent Runner (Now using Raiden)
// ─────────────────────────────────────────────

/**
 * Runs a single agent by building its prompt and calling the Raiden API.
 * Each agent call has a timeout via AbortController for safety.
 */
async function runSingleAgent(
    agent: AgentDefinition,
    code: string
): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
        // Build a structured prompt for this agent
        const prompt = buildAgentPrompt(agent.role, code, agent.instructions);

        // Call Raiden API with a timeout wrapper
        const result = await Promise.race([
            raidenAI(prompt, false, AGENT_TIMEOUT_MS, "agent"),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(new Error(`Agent "${agent.name}" timed out after ${AGENT_TIMEOUT_MS / 1000}s`)),
                    AGENT_TIMEOUT_MS
                )
            ),
        ]);

        const durationMs = Date.now() - startTime;

        return {
            id: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            status: "success",
            result,
            durationMs,
        };
    } catch (error: unknown) {
        const durationMs = Date.now() - startTime;
        const errorMessage =
            error instanceof Error
                ? error.message
                : "Unknown error occurred";

        return {
            id: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            status: "error",
            result: "",
            durationMs,
            error: errorMessage,
        };
    }
}

// ─────────────────────────────────────────────
// Main POST Handler
// ─────────────────────────────────────────────

/**
 * POST /api/agents — Parallel multi-agent code analysis.
 *
 * Flow:
 * 1. Validate code input (non-empty, ≤ 4000 chars)
 * 2. Dispatch all 4 agents in parallel via Promise.allSettled()
 * 3. Collect results — some may have succeeded, some may have failed
 * 4. Return JSON response with all agent results + total timing
 */
export async function POST(request: Request): Promise<Response> {
    try {
        // Step 1: Validate input
        const body: unknown = await request.json();
        const code = validateRequest(body);

        // Step 2: Dispatch all agents in parallel
        const totalStart = Date.now();

        /**
         * Promise.allSettled() ensures error isolation:
         * if one agent fails (timeout, API error), the others still return.
         */
        const results = await Promise.allSettled(
            AGENTS.map((agent) => runSingleAgent(agent, code))
        );

        const totalDurationMs = Date.now() - totalStart;

        // Step 3: Collect results from settled promises
        const agentResponses: AgentResponse[] = results.map((result, index) => {
            if (result.status === "fulfilled") {
                return result.value;
            }

            // Safety fallback — shouldn't happen since runSingleAgent catches its own errors
            const agent = AGENTS[index];
            return {
                id: agent.id,
                name: agent.name,
                emoji: agent.emoji,
                status: "error" as const,
                result: "",
                durationMs: totalDurationMs,
                error:
                    result.reason instanceof Error
                        ? result.reason.message
                        : "Unknown error",
            };
        });

        // Step 4: Return JSON response
        const responseBody: AgentsResponseBody = {
            agents: agentResponses,
            totalDurationMs,
        };

        return new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error: unknown) {
        // Handle validation errors
        const message =
            error instanceof Error ? error.message : "An unexpected error occurred";

        const status = message.includes("exceeds maximum")
            ? 413
            : message.includes("must contain") || message.includes("cannot be empty")
                ? 400
                : 500;

        return new Response(
            JSON.stringify({ error: message, code: "VALIDATION_ERROR" }),
            { status, headers: { "Content-Type": "application/json" } }
        );
    }
}
