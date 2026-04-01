/**
 * lib/types.ts — Shared TypeScript interfaces for the DevMind platform.
 *
 * Centralizing all type definitions here ensures consistency across API routes,
 * components, and library code. Every type is strictly defined — no `any` types.
 */

// ─────────────────────────────────────────────
// Chat Module Types
// ─────────────────────────────────────────────

/** Represents a single message in the chat conversation. */
export interface ChatMessage {
  /** Role of the message sender — mirrors Anthropic API roles */
  role: "user" | "assistant";
  /** The text content of the message */
  content: string;
}

/** Request body for the POST /api/chat endpoint */
export interface ChatRequest {
  /** Full conversation history — sent to preserve context across turns */
  messages: ChatMessage[];
}

// ─────────────────────────────────────────────
// Agent Module Types
// ─────────────────────────────────────────────

/** Severity levels for security findings — ordered from most to least critical */
export type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";

/** Unique identifier for each specialized agent */
export type AgentId = "complexity" | "security" | "refactor" | "documentation";

/**
 * Lifecycle status of an individual agent request.
 * - pending:  Agent has been queued but not yet started
 * - running:  Agent is currently processing (API call in flight)
 * - complete: Agent finished successfully and produced output
 * - failed:   Agent encountered an error (timeout, API failure, etc.)
 */
export type AgentStatus = "pending" | "running" | "complete" | "failed";

/** Request body for the POST /api/agents endpoint */
export interface AgentRequest {
  /** The source code to analyze — max 4000 characters */
  code: string;
}

/**
 * A single finding from an agent's analysis.
 * Structured to support severity-tagged rendering in the UI.
 */
export interface AgentFinding {
  /** The finding title/category */
  title: string;
  /** Detailed description of the finding */
  description: string;
  /** Severity classification (primarily used by Security Auditor) */
  severity: SeverityLevel;
  /** Line number reference in the submitted code, if applicable */
  lineNumber?: number;
}

/**
 * Structured result from a single agent's analysis.
 * Designed to support both JSON responses and SSE streaming.
 */
export interface AgentResult {
  /** Which agent produced this result */
  agentId: AgentId;
  /** Human-readable agent name for display */
  agentName: string;
  /** Emoji icon for the agent card header */
  emoji: string;
  /** Current lifecycle status */
  status: AgentStatus;
  /** The full analysis text (markdown-formatted) */
  analysis: string;
  /** Structured findings extracted from the analysis */
  findings: AgentFinding[];
  /** Confidence score from 0-100 indicating the agent's confidence in its analysis */
  confidenceScore: number;
  /** Error message if the agent failed */
  error?: string;
  /** Execution time in milliseconds */
  executionTimeMs: number;
}

/**
 * SSE event types used when streaming agent results.
 * Each event type corresponds to a different lifecycle phase.
 */
export type SSEEventType = "agent-start" | "agent-chunk" | "agent-complete" | "agent-error" | "all-complete";

/** Server-Sent Event payload for agent streaming */
export interface SSEEvent {
  /** Event type determines how the frontend handles this event */
  type: SSEEventType;
  /** Which agent this event pertains to */
  agentId: AgentId;
  /** Partial or full data associated with the event */
  data: string | AgentResult;
}

// ─────────────────────────────────────────────
// Tool Use Types (Security Auditor CVE Lookup)
// ─────────────────────────────────────────────

/** Input schema for the check_cve_database tool */
export interface CVEToolInput {
  /** Name of the vulnerability to look up (e.g., "SQL Injection", "XSS") */
  vulnerability_name: string;
}

/** Result from a CVE database lookup */
export interface CVEResult {
  /** CVE identifier (e.g., "CVE-2024-12345") */
  cve_id: string;
  /** Description of the vulnerability */
  description: string;
  /** CVSS severity score (0-10) */
  cvss_score: number;
  /** URL reference to the CVE details */
  reference_url: string;
}

// ─────────────────────────────────────────────
// UI State Types
// ─────────────────────────────────────────────

/** Frontend state for tracking all agent statuses simultaneously */
export interface AgentStatusMap {
  complexity: AgentStatus;
  security: AgentStatus;
  refactor: AgentStatus;
  documentation: AgentStatus;
}

/** Theme options for the application */
export type Theme = "dark" | "light";
