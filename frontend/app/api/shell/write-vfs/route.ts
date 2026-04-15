/**
 * app/api/shell/write-vfs/route.ts
 *
 * Writes the in-browser Virtual File System to a real directory on disk
 * so shell commands (npm install, npm run dev, etc.) can actually run against it.
 *
 * POST body: { chatId: string, vfs: Record<string, string> }
 * Response:  { workDir: string }
 *
 * ⚠️  DEVELOPMENT ONLY — disabled in production.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";

export async function POST(request: Request): Promise<Response> {
  // Hard block in production
  if (process.env.NODE_ENV === "production") {
    return new Response(
      JSON.stringify({ error: "Shell access is disabled in production." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await request.json();
    const { chatId, vfs } = body as { chatId: string; vfs: Record<string, string> };

    if (!chatId || typeof vfs !== "object") {
      return new Response(
        JSON.stringify({ error: "Missing chatId or vfs in request body." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Write to OS temp dir: /tmp/devmind-<chatId>/
    const workDir = join(tmpdir(), `devmind-${chatId}`);
    console.log(`[SHELL] 📁 Writing VFS to disk: ${workDir}`);
    mkdirSync(workDir, { recursive: true });

    let fileCount = 0;
    for (const [filePath, content] of Object.entries(vfs)) {
      if (typeof content !== "string") continue;
      const fullPath = join(workDir, filePath);
      const dir = dirname(fullPath);
      mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, content, "utf-8");
      fileCount++;
    }

    console.log(`[SHELL] ✅ ${fileCount} files written to ${workDir}`);
    return new Response(JSON.stringify({ workDir, fileCount }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[SHELL] ❌ write-vfs failed:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
