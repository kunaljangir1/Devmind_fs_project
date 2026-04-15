/**
 * app/api/agents/route.ts — Multi-Agent Code Analyzer (Raiden API)
 *
 * Flow:
 * 1. Validate code is not empty and within length limits
 * 2. DSA/SQL check — reject non-DSA/SQL code with a friendly message
 * 3. Dispatch 4 specialized agents in TRUE PARALLEL via Promise.allSettled()
 * 4. Each agent uses a best-fit model with per-model fallback chain
 *
 * Model assignments (best-fit per agent):
 *   complexity  → deepseek-r1, gemini-2.5-pro, gpt-5, claude-sonnet-4
 *   security    → claude-sonnet-4, gpt-5, gemini-2.5-pro, deepseek-r1
 *   refactor    → gemini-2.5-pro, claude-sonnet-4, gpt-5, deepseek-v3.1
 *   docs        → gpt-4o-latest, gemini-2.5-flash, gpt-5, deepseek-v3
 */

import { buildAgentPrompt } from "@/lib/raiden";
import { MAX_CODE_LENGTH, AGENT_TIMEOUT_MS, RAIDEN_BASE_URL, MAX_URL_LENGTH } from "@/lib/config";

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
    /** Ordered list of preferred models. First available wins; falls back in order. */
    preferredModels: string[];
}

interface AgentResponse {
    id: AgentId;
    name: string;
    emoji: string;
    status: "success" | "error";
    result: string;
    durationMs: number;
    modelUsed?: string;
    error?: string;
}

// ─────────────────────────────────────────────
// Agent Definitions with per-agent model preferences
// ─────────────────────────────────────────────

const AGENTS: AgentDefinition[] = [
    {
        id: "complexity",
        name: "Complexity Analyst",
        emoji: "📊",
        role: "You are a computer science complexity analyst specializing in DSA and algorithm analysis.",
        instructions:
            "Analyze the time complexity (Big O) and space complexity of this DSA/SQL code. " +
            "Identify bottlenecks, nested loops, and recursive calls. " +
            "Provide specific Big O notation for each function/query. " +
            "Suggest optimizations with before/after complexity comparisons. " +
            "Structure your output with: Overall Complexity, Function-by-Function Analysis, " +
            "Bottlenecks Identified, Optimization Recommendations, and a Confidence Score (0-100).",
        // deepseek-r1 is best for reasoning/algorithm analysis; gemini-2.5-pro as fallback
        preferredModels: ["deepseek-r1", "gemini-2.5-pro", "gpt-5", "claude-sonnet-4", "gpt-4o-latest", "deepseek-v3.1", "gpt-5.2", "o3-mini"],
    },
    {
        id: "security",
        name: "Security Auditor",
        emoji: "🔐",
        role: "You are a senior application security engineer specializing in DSA and database security.",
        instructions:
            "Scan this DSA/SQL code for security vulnerabilities. Check for: " +
            "SQL injection, input validation issues, insecure data handling, hardcoded secrets, " +
            "improper error handling, and OWASP Top 10 issues. " +
            "Rate each finding as [CRITICAL], [HIGH], [MEDIUM], [LOW], or [INFO]. " +
            "For each finding include: severity, description, location, impact, and remediation. " +
            "End with an overall risk assessment and Confidence Score (0-100).",
        // claude-sonnet-4 excels at security analysis
        preferredModels: ["claude-sonnet-4", "gpt-5", "gemini-2.5-pro", "deepseek-r1", "gpt-4o-latest", "gpt-5.2", "deepseek-v3.1", "o3-mini"],
    },
    {
        id: "refactor",
        name: "Refactor Advisor",
        emoji: "✨",
        role: "You are a clean code expert and software architect specializing in DSA optimization.",
        instructions:
            "Suggest concrete refactoring improvements for this DSA/SQL code. " +
            "Focus on: DRY violations, naming conventions, function length, " +
            "single responsibility principle, and modern language idioms. " +
            "Show before/after examples where possible. " +
            "Identify applicable design patterns (Strategy, Factory, Iterator, etc.). " +
            "Structure: Code Quality Summary, Refactoring Opportunities, " +
            "Modern Idioms, and a Confidence Score (0-100).",
        // gemini-2.5-pro is strong at code refactoring
        preferredModels: ["gemini-2.5-pro", "claude-sonnet-4", "gpt-5", "deepseek-v3.1", "gpt-4o-latest", "deepseek-r1", "gpt-5.2", "gemini-2.5-flash"],
    },
    {
        id: "docs",
        name: "Documentation Generator",
        emoji: "📝",
        role: "You are a technical documentation specialist for DSA and database code.",
        instructions:
            "Generate complete documentation for this DSA/SQL code including: " +
            "JSDoc/docstring comments for every function/procedure, parameter descriptions with types, " +
            "return value descriptions, usage examples with sample inputs and expected outputs, " +
            "and a brief README section describing what this code does and its algorithmic approach. " +
            "Structure: Code Overview, Function Documentation, Usage Examples, " +
            "Type Definitions, and a Confidence Score (0-100).",
        // gpt-4o-latest is great at docs; gemini-2.5-flash for speed as fallback
        preferredModels: ["gpt-4o-latest", "gemini-2.5-flash", "gpt-5", "gemini-2.5-pro", "deepseek-v3", "deepseek-v3.1", "claude-sonnet-4", "gpt-5.2"],
    },
];

// ─────────────────────────────────────────────
// DSA / SQL Classification
// ─────────────────────────────────────────────

/**
 * Uses the Raiden API to classify whether the submitted code is DSA or SQL related.
 * Returns { isDSA: boolean, reason: string }
 */
async function classifyCode(code: string): Promise<{ isDSA: boolean; reason: string }> {
    const classifyPrompt =
        `You are a strict code classifier. Analyze the following code and determine if it is related to:\n` +
        `- Data Structures and Algorithms (DSA): arrays, linked lists, trees, graphs, sorting, searching, dynamic programming, recursion, stacks, queues, heaps, hash maps, etc.\n` +
        `- SQL / Database queries: SELECT, INSERT, UPDATE, DELETE, JOINs, indexes, stored procedures, etc.\n\n` +
        `Code:\n\`\`\`\n${code.slice(0, 1500)}\n\`\`\`\n\n` +
        `Reply with ONLY a JSON object in this exact format (no markdown, no explanation):\n` +
        `{"isDSA": true, "reason": "Brief reason"}\n` +
        `or\n` +
        `{"isDSA": false, "reason": "Brief reason explaining what the code actually is"}`;

    // Use a fast model for classification
    const classifyModels = ["gemini-3-flash", "gemini-2.5-flash", "gpt-4o-latest", "deepseek-v3.1"];

    for (const model of classifyModels) {
        try {
            const url = new URL(RAIDEN_BASE_URL);
            url.searchParams.set("model", model);
            url.searchParams.set("new_session", "false");
            url.searchParams.set("text", classifyPrompt);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(url.toString(), {
                method: "GET",
                signal: controller.signal,
                headers: { Accept: "application/json" },
            });
            clearTimeout(timeoutId);

            if (!response.ok) continue;

            const data = await response.json();
            if (!data.success || !data.generated_text) continue;

            // Parse the JSON from the response
            const jsonMatch = data.generated_text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) continue;

            const parsed = JSON.parse(jsonMatch[0]);
            if (typeof parsed.isDSA === "boolean") {
                return { isDSA: parsed.isDSA, reason: parsed.reason || "" };
            }
        } catch {
            // try next model
        }
    }

    // If classification fails, default to allowing (fail open)
    return { isDSA: true, reason: "Classification unavailable, proceeding with analysis." };
}

// ─────────────────────────────────────────────
// Raiden API caller with per-model fallback
// ─────────────────────────────────────────────

function compressPrompt(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    const half = Math.floor(maxLen / 2) - 30;
    return text.slice(0, half) + "\n\n[...TRUNCATED...]\n\n" + text.slice(-half);
}

async function callRaidenWithFallback(
    prompt: string,
    preferredModels: string[],
    timeoutMs: number,
    agentName: string
): Promise<{ text: string; modelUsed: string }> {
    let lastError = "";

    for (const model of preferredModels) {
        try {
            const url = new URL(RAIDEN_BASE_URL);
            url.searchParams.set("model", model);
            url.searchParams.set("new_session", "false");

            // Calculate max prompt length for URL
            const baseLen = url.toString().length + "&text=".length;
            const maxPromptLen = MAX_URL_LENGTH - baseLen - 200;
            const safePrompt = compressPrompt(prompt, maxPromptLen);
            url.searchParams.set("text", safePrompt);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            console.log(`[agents] ${agentName} trying model: ${model}`);

            const response = await fetch(url.toString(), {
                method: "GET",
                signal: controller.signal,
                headers: { Accept: "application/json" },
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                lastError = `HTTP ${response.status}`;
                console.warn(`[agents] ${agentName} model ${model} failed: HTTP ${response.status}`);
                continue;
            }

            const data = await response.json();
            if (!data.success || !data.generated_text) {
                lastError = data.message || "Empty response";
                console.warn(`[agents] ${agentName} model ${model} returned empty/false`);
                continue;
            }

            console.log(`[agents] ${agentName} succeeded with model: ${model}`);
            return { text: data.generated_text, modelUsed: model };

        } catch (err: any) {
            lastError = err?.message || "Unknown error";
            console.warn(`[agents] ${agentName} model ${model} threw: ${lastError}`);
        }
    }

    throw new Error(`All ${preferredModels.length} models failed for ${agentName}. Last: ${lastError}`);
}

// ─────────────────────────────────────────────
// Single Agent Runner
// ─────────────────────────────────────────────

async function runSingleAgent(agent: AgentDefinition, code: string): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
        const prompt = buildAgentPrompt(agent.role, code, agent.instructions);
        const { text, modelUsed } = await callRaidenWithFallback(
            prompt,
            agent.preferredModels,
            AGENT_TIMEOUT_MS,
            agent.name
        );

        return {
            id: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            status: "success",
            result: text,
            durationMs: Date.now() - startTime,
            modelUsed,
        };
    } catch (error: unknown) {
        return {
            id: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            status: "error",
            result: "",
            durationMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

// ─────────────────────────────────────────────
// Input Validation
// ─────────────────────────────────────────────

function validateRequest(body: unknown): string {
    if (!body || typeof body !== "object" || !("code" in body)) {
        throw new Error("Request body must contain a 'code' field");
    }

    const { code } = body as { code: string };

    if (typeof code !== "string") throw new Error("Code must be a string");

    const trimmed = code.trim();

    if (trimmed.length === 0) throw new Error("Code cannot be empty");

    if (trimmed.length > MAX_CODE_LENGTH) {
        throw new Error(
            `Code exceeds maximum length of ${MAX_CODE_LENGTH} characters (submitted: ${trimmed.length})`
        );
    }

    return trimmed;
}

// ─────────────────────────────────────────────
// Main POST Handler
// ─────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
    try {
        const body: unknown = await request.json();
        const code = validateRequest(body);

        // ── Step 1: DSA / SQL Classification ──
        const { isDSA, reason } = await classifyCode(code);

        if (!isDSA) {
            return new Response(
                JSON.stringify({
                    error: "NOT_DSA_CODE",
                    message: `⚠️ This analyzer only supports DSA (Data Structures & Algorithms) and SQL code.\n\n${reason}\n\nPlease paste a DSA algorithm (sorting, searching, dynamic programming, trees, graphs, etc.) or an SQL query for analysis.`,
                    code: "NOT_DSA_CODE",
                }),
                { status: 422, headers: { "Content-Type": "application/json" } }
            );
        }

        // ── Step 2: Run all 4 agents in parallel ──
        const totalStart = Date.now();

        const results = await Promise.allSettled(
            AGENTS.map((agent) => runSingleAgent(agent, code))
        );

        const totalDurationMs = Date.now() - totalStart;

        const agentResponses: AgentResponse[] = results.map((result, index) => {
            if (result.status === "fulfilled") return result.value;

            const agent = AGENTS[index];
            return {
                id: agent.id,
                name: agent.name,
                emoji: agent.emoji,
                status: "error" as const,
                result: "",
                durationMs: totalDurationMs,
                error: result.reason instanceof Error ? result.reason.message : "Unknown error",
            };
        });

        return new Response(
            JSON.stringify({ agents: agentResponses, totalDurationMs }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "An unexpected error occurred";
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
