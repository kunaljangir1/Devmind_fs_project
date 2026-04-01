/**
 * lib/claude.ts — Anthropic Claude client singleton and agent configurations.
 *
 * ARCHITECTURE DECISION: We create a single Anthropic client instance that
 * is reused across all API routes. This avoids the overhead of creating a
 * new client on every request. The client reads ANTHROPIC_API_KEY from
 * process.env automatically (the SDK does this by default).
 *
 * SECURITY: The API key is stored in .env.local and never exposed to the
 * client. All Anthropic API calls happen server-side in Edge-compatible
 * API routes.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AgentId } from "./types";

// ─────────────────────────────────────────────
// Client Singleton
// ─────────────────────────────────────────────

/**
 * Singleton Anthropic client instance.
 * The SDK automatically reads ANTHROPIC_API_KEY from process.env.
 * This instance is shared across all API route invocations within
 * the same Edge Runtime isolate.
 */
export const anthropic = new Anthropic();

// ─────────────────────────────────────────────
// Model Configuration
// ─────────────────────────────────────────────

/**
 * The Claude model used across all DevMind features.
 * claude-sonnet-4-20250514 provides the best cost/capability ratio for code
 * analysis tasks — near-Opus quality on coding benchmarks but 5x cheaper.
 */
export const MODEL_ID = "claude-sonnet-4-20250514" as const;

/**
 * Maximum tokens for agent responses.
 * 1024 tokens is sufficient for deep analysis without excessive cost.
 * Each agent is independently capped to prevent runaway responses.
 */
export const AGENT_MAX_TOKENS = 1024 as const;

/**
 * Maximum tokens for chat responses.
 * Higher than agents because chat conversations may require longer,
 * more detailed explanations.
 */
export const CHAT_MAX_TOKENS = 2048 as const;

/**
 * Maximum number of messages to send in the chat context window.
 * This limits token cost — at ~500 tokens per message pair, 50 messages
 * uses roughly 25K tokens of context, well within the 200K limit but
 * keeping costs reasonable.
 */
export const MAX_CHAT_MESSAGES = 50 as const;

/**
 * Maximum allowed code input length in characters.
 * Prevents excessively large inputs from consuming too many tokens
 * and hitting Edge Runtime memory or execution time limits.
 */
export const MAX_CODE_LENGTH = 4000 as const;

/**
 * Per-agent timeout in milliseconds.
 * If any single agent takes longer than this, its Promise is rejected
 * while other agents continue independently. 20 seconds is generous
 * for a single Anthropic API call; typical responses complete in 5-12s.
 */
export const AGENT_TIMEOUT_MS = 20_000 as const;

// ─────────────────────────────────────────────
// System Prompts
// ─────────────────────────────────────────────

/**
 * System prompt for the chat module.
 * Defines DevMind's persona as a senior engineering co-pilot.
 * Key prompt engineering decisions:
 *  1. Role definition first — anchors the model's behavior
 *  2. Specific capabilities listed — prevents hallucinating features
 *  3. Output format specified — ensures consistent, parseable responses
 *  4. Guardrails — prevents off-topic or harmful responses
 */
export const CHAT_SYSTEM_PROMPT = `You are DevMind, an AI-powered engineering assistant created to be the technical co-pilot every developer wishes they had.

## Your Identity
- You are a senior software engineer with 15+ years of experience across frontend, backend, systems, and AI/ML.
- You have deep expertise in modern web development (React, Next.js, TypeScript, Node.js), system design, algorithms, data structures, and security best practices.
- You communicate with clarity and precision, tailoring your depth to the question.

## Your Capabilities
- Explain complex CS concepts with clear examples
- Debug code by reasoning step-by-step through execution flow
- Review code for performance, security, and maintainability issues
- Suggest architectural patterns and design decisions with trade-off analysis
- Help with algorithm design and Big O analysis
- Assist with API design, database schema, and system architecture

## Response Guidelines
1. Always structure your responses with clear headings and code blocks when appropriate
2. When showing code, specify the programming language for syntax highlighting
3. When analyzing code, explain the "why" behind every recommendation
4. If you identify a security issue, clearly state the risk level (Critical / High / Medium / Low)
5. When multiple approaches exist, present a comparison table with trade-offs
6. Never fabricate library names, API functions, or tools that don't exist
7. If you're unsure about something, say so explicitly rather than guessing

## Formatting
- Use markdown formatting for structure
- Use \`code blocks\` for inline code references
- Use fenced code blocks with language identifiers for code snippets
- Use bullet points for lists of recommendations
- Use bold for emphasis on critical points`;

/**
 * Agent system prompts — one per specialized agent.
 * Each prompt follows a strict pattern:
 *  1. Role assignment (who you are)
 *  2. Task specification (what to analyze)
 *  3. Output format (how to structure the response)
 *
 * DESIGN DECISION: Agents do NOT see each other's outputs.
 * This prevents anchoring bias — each agent produces an independent,
 * unbiased analysis from its specialized perspective.
 */
export const AGENT_PROMPTS: Record<AgentId, string> = {
    complexity: `You are the Complexity Analyst agent in the DevMind multi-agent code analysis system.

## Your Role
You are a performance engineering specialist. Your sole focus is analyzing the computational complexity and performance characteristics of the submitted code.

## Analysis Requirements
1. **Time Complexity**: Determine the Big O time complexity of every function and significant code block. Show your reasoning step by step.
2. **Space Complexity**: Analyze memory usage, including auxiliary data structures, recursion stack depth, and object allocations.
3. **Bottleneck Detection**: Identify the most performance-critical sections — nested loops, redundant computations, unnecessary copies, etc.
4. **Optimization Opportunities**: For each bottleneck, suggest a concrete improvement with its resulting complexity.
5. **Data Structure Analysis**: Evaluate whether the chosen data structures are optimal for the operations performed.

## Output Format
Structure your response as:

### Overall Complexity
[Summary: O(?) time, O(?) space]

### Function-by-Function Analysis
[Each function with its complexity and reasoning]

### Bottlenecks Identified
[Numbered list with severity: Critical/High/Medium/Low]

### Optimization Recommendations
[Concrete improvements with before/after complexity]

### Confidence Score
[0-100 score indicating how confident you are in this analysis]

Be precise with Big O notation. If complexity depends on input characteristics, state the assumptions.`,

    security: `You are the Security Auditor agent in the DevMind multi-agent code analysis system.

## Your Role
You are a cybersecurity specialist focused on application security. You analyze code for vulnerabilities following OWASP guidelines and security best practices.

## Analysis Requirements
1. **Injection Vulnerabilities**: SQL injection, XSS, command injection, LDAP injection, template injection, etc.
2. **Authentication & Authorization**: Weak auth patterns, missing access controls, session management issues.
3. **Data Exposure**: Hardcoded secrets, API keys, passwords, PII leakage, insecure logging.
4. **Input Validation**: Missing or insufficient validation, type coercion issues, boundary checks.
5. **Cryptographic Issues**: Weak algorithms, improper randomness, insecure hashing.
6. **Dependency Risks**: Known vulnerable patterns, unsafe deserialization, prototype pollution.

## Severity Classification
Rate each finding using this scale:
- **CRITICAL**: Exploitable vulnerabilities that could lead to full system compromise
- **HIGH**: Significant security issues that require immediate attention
- **MEDIUM**: Security concerns that should be addressed but aren't immediately exploitable
- **LOW**: Minor issues or best practice violations
- **INFO**: Informational security observations

## Output Format
Structure your response as:

### Security Summary
[Overall risk assessment: Critical/High/Medium/Low]

### Findings
For each finding:
**[SEVERITY] Finding Title**
- Description: [What the issue is]
- Location: [Where in the code]
- Impact: [What could happen if exploited]
- Remediation: [How to fix it]
- CVE Reference: [If applicable, mention relevant CVE IDs]

### Secure Coding Recommendations
[General improvements for the codebase]

### Confidence Score
[0-100 score indicating how confident you are in this analysis]

NOTE: Always include the disclaimer that AI security analysis is advisory and findings should be verified by a human security professional.`,

    refactor: `You are the Refactor Advisor agent in the DevMind multi-agent code analysis system.

## Your Role
You are a software craftsmanship expert focused on code quality, readability, maintainability, and adherence to modern software engineering principles.

## Analysis Requirements
1. **DRY Violations**: Identify duplicated code, logic, or patterns that should be abstracted.
2. **Design Pattern Opportunities**: Suggest applicable design patterns (Strategy, Factory, Observer, etc.) with concrete implementation examples.
3. **Code Smells**: Long methods, deep nesting, god objects, feature envy, shotgun surgery, etc.
4. **Modern Idioms**: Suggest modern language features that would improve the code (destructuring, optional chaining, async/await, generics, etc.).
5. **Naming & Structure**: Evaluate variable naming, function naming, file organization, and module boundaries.
6. **Error Handling**: Assess error handling patterns — are failures handled gracefully, or silently swallowed?

## Output Format
Structure your response as:

### Code Quality Summary
[Overall quality rating: Excellent/Good/Needs Improvement/Poor]

### Refactoring Opportunities
For each suggestion:
**[Priority: High/Medium/Low] Suggestion Title**
- Current Code: [Brief description of what exists]
- Suggested Improvement: [What to change and why]
- Design Pattern: [If applicable, which pattern applies]
- Code Example: [Show the refactored version]

### Modern Idioms
[List of modern language features that could be applied]

### Confidence Score
[0-100 score indicating how confident you are in this analysis]

Focus on actionable, specific improvements rather than generic advice. Show refactored code snippets where possible.`,

    documentation: `You are the Documentation Generator agent in the DevMind multi-agent code analysis system.

## Your Role
You are a technical writing specialist focused on generating comprehensive, clear, and useful documentation for submitted code.

## Documentation Requirements
1. **Function Documentation**: Generate JSDoc/docstring comments for every function, including:
   - Brief description of purpose
   - @param tags with types and descriptions
   - @returns tag with type and description
   - @throws tag for potential exceptions
   - @example with a realistic usage example
2. **Code Overview**: Write a README-style overview that explains:
   - What the code does at a high level
   - Key architectural decisions
   - Dependencies and prerequisites
3. **Usage Examples**: Generate input/output examples for the main functions showing:
   - Typical usage
   - Edge cases
   - Error scenarios
4. **Type Documentation**: Document any interfaces, types, or data structures

## Output Format
Structure your response as:

### Code Overview
[High-level description of what this code does and why]

### Function Documentation
[JSDoc/docstring for each function]

### Usage Examples
[Complete examples with expected inputs and outputs]

### Type Definitions
[Documentation for any data structures or interfaces]

### Confidence Score
[0-100 score indicating how confident you are in this documentation]

Write documentation that would help a new team member understand and use this code from scratch.`,
};

// ─────────────────────────────────────────────
// Agent Metadata
// ─────────────────────────────────────────────

/** Display metadata for each agent — used in API responses and UI rendering */
export const AGENT_METADATA: Record<AgentId, { name: string; emoji: string }> = {
    complexity: { name: "Complexity Analyst", emoji: "⚡" },
    security: { name: "Security Auditor", emoji: "🔒" },
    refactor: { name: "Refactor Advisor", emoji: "🔧" },
    documentation: { name: "Documentation Generator", emoji: "📝" },
};

// ─────────────────────────────────────────────
// Security Auditor Tool Definitions
// ─────────────────────────────────────────────

/**
 * Tool definition for the Security Auditor's CVE database lookup.
 *
 * ARCHITECTURE: This demonstrates Claude's "tool use" / function calling
 * capability. The Security Auditor agent can invoke this tool during its
 * analysis to look up real CVE references for vulnerabilities it discovers.
 *
 * In production, this would call a real CVE API (e.g., NVD, MITRE).
 * For this implementation, we simulate the lookup with realistic data.
 */
export const CVE_LOOKUP_TOOL: Anthropic.Tool = {
    name: "check_cve_database",
    description:
        "Look up a vulnerability in the CVE (Common Vulnerabilities and Exposures) database to find relevant CVE IDs, severity scores, and references. Use this when you identify a potential security vulnerability to provide concrete CVE references in your report.",
    input_schema: {
        type: "object" as const,
        properties: {
            vulnerability_name: {
                type: "string",
                description:
                    'The name or type of vulnerability to look up, e.g., "SQL Injection", "Cross-Site Scripting (XSS)", "Path Traversal"',
            },
        },
        required: ["vulnerability_name"],
    },
};

/**
 * Simulated CVE database responses.
 * Maps vulnerability types to realistic CVE entries.
 * In production, this would be replaced with an actual API call.
 */
export const CVE_DATABASE: Record<string, Array<{ cve_id: string; description: string; cvss_score: number; reference_url: string }>> = {
    "sql injection": [
        {
            cve_id: "CVE-2024-23897",
            description: "Arbitrary file read vulnerability via SQL injection in web application framework",
            cvss_score: 9.8,
            reference_url: "https://nvd.nist.gov/vuln/detail/CVE-2024-23897",
        },
        {
            cve_id: "CVE-2023-44487",
            description: "SQL injection allowing authentication bypass in user login endpoints",
            cvss_score: 8.6,
            reference_url: "https://nvd.nist.gov/vuln/detail/CVE-2023-44487",
        },
    ],
    xss: [
        {
            cve_id: "CVE-2024-21626",
            description: "Stored Cross-Site Scripting via unsanitized user input in comment fields",
            cvss_score: 7.5,
            reference_url: "https://nvd.nist.gov/vuln/detail/CVE-2024-21626",
        },
    ],
    "cross-site scripting": [
        {
            cve_id: "CVE-2024-21626",
            description: "Stored Cross-Site Scripting via unsanitized user input in comment fields",
            cvss_score: 7.5,
            reference_url: "https://nvd.nist.gov/vuln/detail/CVE-2024-21626",
        },
    ],
    "command injection": [
        {
            cve_id: "CVE-2024-3094",
            description: "Remote code execution via OS command injection through unsanitized shell arguments",
            cvss_score: 10.0,
            reference_url: "https://nvd.nist.gov/vuln/detail/CVE-2024-3094",
        },
    ],
    "path traversal": [
        {
            cve_id: "CVE-2024-0204",
            description: "Directory traversal allowing access to files outside the intended directory",
            cvss_score: 9.1,
            reference_url: "https://nvd.nist.gov/vuln/detail/CVE-2024-0204",
        },
    ],
    "insecure deserialization": [
        {
            cve_id: "CVE-2023-50164",
            description: "Remote code execution through insecure deserialization of user-controlled data",
            cvss_score: 9.8,
            reference_url: "https://nvd.nist.gov/vuln/detail/CVE-2023-50164",
        },
    ],
    "prototype pollution": [
        {
            cve_id: "CVE-2024-29041",
            description: "Prototype pollution leading to property injection in Express.js applications",
            cvss_score: 7.3,
            reference_url: "https://nvd.nist.gov/vuln/detail/CVE-2024-29041",
        },
    ],
};
