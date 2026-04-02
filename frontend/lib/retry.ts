/**
 * lib/retry.ts — Retry and timeout utilities for API calls.
 *
 * Provides:
 * 1. withRetry<T>() — retries async functions with exponential backoff
 * 2. withTimeout<T>() — wraps async functions with AbortController timeout
 * 3. TimeoutError — custom error class for timeout failures
 * 4. RaidenError — custom error class for API-specific failures
 */

// ─────────────────────────────────────────────
// Custom Error Classes
// ─────────────────────────────────────────────

/**
 * Thrown when a request exceeds its allowed time limit.
 * Includes the timeout duration for debugging.
 */
export class TimeoutError extends Error {
    /** The timeout duration that was exceeded, in milliseconds */
    readonly timeoutMs: number;

    constructor(timeoutMs: number, context?: string) {
        const msg = context
            ? `Request timed out after ${timeoutMs}ms: ${context}`
            : `Request timed out after ${timeoutMs}ms`;
        super(msg);
        this.name = "TimeoutError";
        this.timeoutMs = timeoutMs;
    }
}

/**
 * Custom error for Raiden API failures.
 * Includes HTTP status code and retryability information.
 */
export class RaidenError extends Error {
    /** HTTP status code from the API response */
    readonly statusCode: number;
    /** Whether this error is worth retrying (true for 5xx, false for 4xx) */
    readonly retryable: boolean;

    constructor(statusCode: number, message: string) {
        super(message);
        this.name = "RaidenError";
        this.statusCode = statusCode;
        // Only 5xx errors and network errors are worth retrying
        // 4xx errors indicate bad input — retrying won't help
        this.retryable = statusCode >= 500 || statusCode === 0;
    }
}

// ─────────────────────────────────────────────
// withTimeout<T>()
// ─────────────────────────────────────────────

/**
 * Wraps an async function with a timeout using AbortController.
 *
 * If the function doesn't resolve within `timeoutMs` milliseconds,
 * the returned promise rejects with a TimeoutError. The AbortSignal
 * can be used by the inner function to cancel ongoing work (e.g., fetch).
 *
 * @param fn - Async function to wrap. Receives an AbortSignal for cancellation.
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param context - Optional context string for the error message
 * @returns The result of fn() if it completes within the timeout
 * @throws TimeoutError if the timeout is exceeded
 *
 * @example
 * const data = await withTimeout(
 *   (signal) => fetch("https://api.example.com", { signal }),
 *   5000,
 *   "API health check"
 * );
 */
export async function withTimeout<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    context?: string
): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const result = await fn(controller.signal);
        clearTimeout(timer);
        return result;
    } catch (error: unknown) {
        clearTimeout(timer);

        // Check if the error was caused by our abort (timeout)
        if (controller.signal.aborted) {
            throw new TimeoutError(timeoutMs, context);
        }

        // Re-throw the original error if it wasn't a timeout
        throw error;
    }
}

// ─────────────────────────────────────────────
// withRetry<T>()
// ─────────────────────────────────────────────

/**
 * Retries an async function with exponential backoff on transient failures.
 *
 * Retry policy:
 * - RETRIES on: network errors, 5xx server errors, TimeoutError
 * - DOES NOT RETRY on: 4xx client errors (bad input won't get better)
 * - Backoff: delay doubles each attempt (1s → 2s → 4s → ...)
 *
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 2)
 * @param delayMs - Initial delay between retries in ms (default: 1000)
 * @returns The result of fn() on success
 * @throws The last error encountered after all retries are exhausted
 *
 * @example
 * const response = await withRetry(
 *   () => raidenAI("What is Big O?"),
 *   2,
 *   1000
 * );
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 2,
    delayMs: number = 1000
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: unknown) {
            lastError = error;

            // Don't retry on 4xx errors — the request is malformed
            if (error instanceof RaidenError && !error.retryable) {
                throw error;
            }

            // Don't retry if we've exhausted all attempts
            if (attempt >= maxRetries) {
                break;
            }

            // Log retry attempts in development
            if (process.env.NODE_ENV === "development") {
                const msg =
                    error instanceof Error ? error.message : "Unknown error";
                console.log(
                    `[withRetry] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${msg}. ` +
                    `Retrying in ${delayMs}ms...`
                );
            }

            // Wait with exponential backoff before retrying
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            delayMs *= 2; // Exponential backoff: 1s → 2s → 4s → ...
        }
    }

    throw lastError;
}
