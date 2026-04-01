/**
 * lib/config.ts — Typed environment configuration for the Raiden API.
 *
 * All configuration values are centralized here so they can be
 * imported from a single source of truth. Environment variables
 * are accessed server-side only (no NEXT_PUBLIC_ prefix) to prevent
 * leaking the API URL to the client bundle.
 */

/** Base URL for the Raiden AI API */
export const RAIDEN_BASE_URL =
    process.env.RAIDEN_API_BASE_URL || "https://api.raiden.ovh/ai/generate";

/** AI model to use for all Raiden API calls */
export const RAIDEN_MODEL = process.env.RAIDEN_MODEL || "claude-sonnet-4";

/** Maximum length for prompt text (characters) */
export const MAX_PROMPT_LENGTH = 3000;

/** Maximum code input length (characters) — for agents endpoint */
export const MAX_CODE_LENGTH = 4000;

/** Default request timeout in milliseconds */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Per-agent timeout for parallel analysis (slightly shorter than total) */
export const AGENT_TIMEOUT_MS = 25_000;

/** Maximum retry attempts for transient failures */
export const MAX_RETRIES = 2;

/** Maximum URL length before truncation (browser/server safe limit) */
export const MAX_URL_LENGTH = 7500;

/** Maximum chat messages to include in context */
export const MAX_CHAT_MESSAGES = 10;

/** DevMind system prompt prefix prepended to every chat message */
export const DEVMIND_SYSTEM_PROMPT =
    "You are DevMind, an expert AI engineering assistant. " +
    "Answer technical CS and software engineering questions precisely. " +
    "Structure responses with clear headings and code blocks when appropriate. " +
    "When analyzing code, explain the 'why' behind every recommendation. " +
    "If you identify a security issue, state the risk level (Critical/High/Medium/Low). " +
    "Never fabricate library names or APIs. If unsure, say so explicitly.";
