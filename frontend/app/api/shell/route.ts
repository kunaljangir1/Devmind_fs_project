/**
 * app/api/shell/route.ts
 *
 * Executes a shell command and streams output back as Server-Sent Events (SSE).
 * Also handles stopping long-running processes (npm run dev, etc.).
 *
 * POST /api/shell         { command, cwd }  → streams SSE output
 * DELETE /api/shell       { pid }           → kills the process
 *
 * ⚠️  DEVELOPMENT ONLY — disabled in production.
 *
 * SSE event format:
 *   data: {"type":"stdout","data":"..."}\n\n
 *   data: {"type":"stderr","data":"..."}\n\n
 *   data: {"type":"pid","pid":12345}\n\n        ← sent first, so client can kill it
 *   data: {"type":"exit","code":0}\n\n
 */

import { exec, ChildProcess, spawn } from "child_process";

// In-memory store of running processes (dev-server lifetime)
// keyed by PID string
const runningProcesses = new Map<number, ChildProcess>();

/** Strip ANSI escape sequences so output displays cleanly in the browser terminal */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

/**
 * Build a clean environment for child processes.
 * Removes variables that would conflict with the generated project
 * (e.g. DevMind's own PORT, NODE_ENV set by Next.js dev server).
 */
function buildChildEnv(): NodeJS.ProcessEnv {
  // Omit DevMind's PORT/NODE_ENV so the child project can use its own values
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { PORT, NODE_ENV, ...rest } = process.env;
  // Double-cast: TS doesn't allow direct cast from partial to ProcessEnv
  return {
    ...rest,
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    NEXT_TELEMETRY_DISABLED: "1",
  } as unknown as NodeJS.ProcessEnv;
}

function sseEvent(obj: object): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

// ─── POST: run a command ───────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new Response(
      JSON.stringify({ error: "Shell access is disabled in production." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  let command: string;
  let cwd: string;

  try {
    const body = await request.json();
    command = body.command?.trim();
    cwd = body.cwd || process.cwd();

    if (!command) {
      return new Response(
        JSON.stringify({ error: "Missing 'command' in request body." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`[SHELL] 🚀 Running: ${command}`);
  console.log(`[SHELL]    cwd: ${cwd}`);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const proc = spawn(command, {
        shell: true,
        cwd,
        env: buildChildEnv(),
      });

      console.log(`[SHELL] ⚙️  Process started, PID: ${proc.pid}`);
      runningProcesses.set(proc.pid!, proc);

      // Send PID first so the client can later kill it
      controller.enqueue(
        encoder.encode(sseEvent({ type: "pid", pid: proc.pid }))
      );

      proc.stdout?.on("data", (chunk: Buffer) => {
        const text = stripAnsi(chunk.toString("utf-8"));
        console.log(`[SHELL] stdout: ${text.slice(0, 120)}`);
        controller.enqueue(encoder.encode(sseEvent({ type: "stdout", data: text })));
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        const text = stripAnsi(chunk.toString("utf-8"));
        console.log(`[SHELL] stderr: ${text.slice(0, 120)}`);
        controller.enqueue(encoder.encode(sseEvent({ type: "stderr", data: text })));
      });

      proc.on("close", (code) => {
        console.log(`[SHELL] ✅ Process ${proc.pid} exited with code ${code}`);
        runningProcesses.delete(proc.pid!);
        controller.enqueue(encoder.encode(sseEvent({ type: "exit", code })));
        controller.close();
      });

      proc.on("error", (err) => {
        console.error(`[SHELL] ❌ Process error:`, err.message);
        runningProcesses.delete(proc.pid!);
        controller.enqueue(encoder.encode(sseEvent({ type: "error", message: err.message })));
        controller.close();
      });
    },

    cancel() {
      // Client disconnected — nothing to do here (process keeps running until DELETE)
      console.log("[SHELL] ℹ️  SSE stream cancelled by client");
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering if proxied
    },
  });
}

// ─── DELETE: kill a running process ───────────────────────────────────────────

export async function DELETE(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new Response(
      JSON.stringify({ error: "Shell access is disabled in production." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { pid } = await request.json() as { pid: number };
    const proc = runningProcesses.get(pid);

    if (!proc) {
      return new Response(
        JSON.stringify({ error: `No running process with PID ${pid}` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[SHELL] 🛑 Killing process PID: ${pid}`);
    // On Windows use taskkill to kill the whole process tree
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/f", "/t"]);
    } else {
      process.kill(-proc.pid!, "SIGTERM");
    }

    runningProcesses.delete(pid);
    return new Response(JSON.stringify({ killed: pid }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[SHELL] ❌ Kill failed:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
