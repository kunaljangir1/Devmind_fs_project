/**
 * lib/agent-engine.ts — DevMind Coding Agent Engine
 *
 * Manages the Virtual File System (VFS), builds structured prompts,
 * and parses the agent's JSON-formatted action responses.
 *
 * Designed for URL-constrained APIs (Raiden GET): prompts are compact
 * but explicit enough for models to produce complete, working code.
 */

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type VirtualFileSystem = Record<string, string>;

export type AgentActionType =
  | "create_file"
  | "edit_file"
  | "delete_file"
  | "message";

export interface AgentAction {
  type: AgentActionType;
  path?: string;
  content?: string;
  message?: string;
}

export interface AgentResponse {
  thinking: string;
  actions: AgentAction[];
  message: string;
  needs_iteration?: boolean;
}

export interface AgentLogEntry {
  timestamp: string;
  type: AgentActionType | "system" | "user";
  text: string;
  path?: string;
}

export interface ConversationTurn {
  role: "user" | "agent";
  content: string;
}

// ─────────────────────────────────────────
// VFS Helpers
// ─────────────────────────────────────────

/**
 * Serialize VFS to a compact file listing for the prompt.
 * Only includes file NAMES and sizes to save URL space.
 * The model knows the project structure without seeing all code.
 */
export function serializeVFSCompact(vfs: VirtualFileSystem): string {
  const files = Object.entries(vfs);
  if (files.length === 0) return "(empty project)";

  return files
    .map(([path, content]) => {
      const lines = content.split("\n").length;
      return `- ${path} (${lines} lines)`;
    })
    .join("\n");
}

/**
 * Serialize VFS with limited code previews.
 * Used when the model needs to see existing code to edit it.
 */
export function serializeVFS(vfs: VirtualFileSystem, maxTotalLength: number = 2000): string {
  const files = Object.entries(vfs);
  if (files.length === 0) return "(empty project)";

  const maxPerFile = Math.min(
    300,
    Math.floor(maxTotalLength / Math.max(files.length, 1))
  );

  const parts: string[] = [];
  let totalLen = 0;

  for (const [path, content] of files) {
    if (totalLen >= maxTotalLength) {
      parts.push(`... and ${files.length - parts.length} more files`);
      break;
    }

    const preview = content.length > maxPerFile
      ? content.slice(0, maxPerFile) + "\n...[truncated]"
      : content;
    const entry = `=== ${path} ===\n${preview}`;
    parts.push(entry);
    totalLen += entry.length;
  }

  return parts.join("\n\n");
}

/** Apply actions to produce a new VFS (immutable update) */
export function applyActionsToVFS(
  vfs: VirtualFileSystem,
  actions: AgentAction[]
): VirtualFileSystem {
  const next = { ...vfs };
  for (const action of actions) {
    if (!action.path) continue;
    if (action.type === "create_file" || action.type === "edit_file") {
      next[action.path] = action.content ?? "";
    } else if (action.type === "delete_file") {
      delete next[action.path];
    }
  }
  return next;
}

/** Build tree structure from flat VFS paths for display */
export function buildFileTree(vfs: VirtualFileSystem): FileTreeNode[] {
  const root: Record<string, FileTreeNode> = {};

  for (const path of Object.keys(vfs)) {
    const parts = path.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (!current[part]) {
        current[part] = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          type: isLast ? "file" : "folder",
          children: {},
        };
      }
      if (!isLast) {
        current = current[part].children as Record<string, FileTreeNode>;
      }
    }
  }

  return sortTreeNodes(root);
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children: Record<string, FileTreeNode>;
}

function sortTreeNodes(nodes: Record<string, FileTreeNode>): FileTreeNode[] {
  return Object.values(nodes).sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// ─────────────────────────────────────────
// Starter Templates
// ─────────────────────────────────────────

export function getStarterVFS(projectName: string, projectType: string): VirtualFileSystem {
  const normalizedName = projectName.replace(/\s+/g, "-").toLowerCase() || "my-app";

  const base: VirtualFileSystem = {
    "README.md": `# ${projectName}\n\nBuilt with DevMind AI Agent.\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`,
    "package.json": JSON.stringify(
      {
        name: normalizedName,
        version: "0.1.0",
        private: true,
        scripts: { dev: "next dev", build: "next build", start: "next start" },
        dependencies: { next: "14.1.0", react: "^18", "react-dom": "^18" },
        devDependencies: {
          typescript: "^5",
          "@types/node": "^20",
          "@types/react": "^18",
          tailwindcss: "^3",
        },
      },
      null,
      2
    ),
    "tsconfig.json": JSON.stringify(
      { compilerOptions: { target: "es5", lib: ["dom", "esnext"], strict: true, jsx: "preserve" } },
      null,
      2
    ),
  };

  if (projectType.toLowerCase().includes("next") || projectType.toLowerCase().includes("react")) {
    return {
      ...base,
      "app/layout.tsx": `import type { Metadata } from 'next';\n\nexport const metadata: Metadata = { title: '${projectName}' };\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`,
      "app/page.tsx": `export default function Home() {\n  return (\n    <main className="flex min-h-screen flex-col items-center justify-center p-24">\n      <h1 className="text-4xl font-bold">${projectName}</h1>\n      <p className="mt-4 text-gray-500">Built with DevMind AI</p>\n    </main>\n  );\n}\n`,
      "app/globals.css": `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`,
    };
  }

  return base;
}

// ─────────────────────────────────────────
// System Prompt Builder
// ─────────────────────────────────────────

/**
 * Builds the system prompt for the agent.
 *
 * Strategy: Keep the INSTRUCTIONS short and crystal-clear.
 * Only include file NAMES (not content) to save URL space.
 * The model should generate complete new files, not edit existing ones character-by-character.
 */
export function buildSystemPrompt(
  vfs: VirtualFileSystem,
  projectName: string,
  history: ConversationTurn[]
): string {
  // File listing (names only — saves massive URL space)
  const fileList = serializeVFSCompact(vfs);

  // Minimal history — just last 2 turns, truncated
  const historyStr =
    history.length > 0
      ? history
          .slice(-2)
          .map((t) => `${t.role === "user" ? "User" : "Agent"}: ${t.content.slice(0, 100)}`)
          .join("\n")
      : "";

  return `You are DevMind, a senior full-stack developer AI agent. You build complete, production-ready applications.

PROJECT: "${projectName}"
FILES:
${fileList}
${historyStr ? `\nRECENT:\n${historyStr}` : ""}

RESPOND WITH VALID JSON ONLY. No markdown wrapping. No explanation outside JSON.

FORMAT:
{"thinking":"brief plan","actions":[{"type":"create_file","path":"app/page.tsx","content":"FULL FILE CONTENT HERE"},{"type":"edit_file","path":"app/page.tsx","content":"FULL REPLACEMENT CONTENT"},{"type":"delete_file","path":"old/file.ts"}],"message":"What you did"}

CRITICAL RULES:
1. ALWAYS write COMPLETE, WORKING code in "content" - NEVER use placeholders like "// ..." or "/* TODO */"
2. Every file must be production-ready with imports, exports, proper styling, and error handling
3. Use Tailwind CSS for styling, modern React patterns, TypeScript
4. When creating a feature, create ALL needed files (components, styles, types, utils)
5. "content" must contain the ENTIRE file - not a snippet, not a diff, the WHOLE file
6. Use relative paths like "app/page.tsx" or "components/Button.tsx"
7. If no changes needed, return {"thinking":"","actions":[],"message":"No changes needed"}`;
}

// ─────────────────────────────────────────
// Response Parser
// ─────────────────────────────────────────

/**
 * Parses the raw AI response text into a structured AgentResponse.
 *
 * Handles multiple formats:
 * 1. Clean JSON: {"thinking": ..., "actions": [...], "message": ...}
 * 2. Markdown-wrapped: ```json\n{...}\n```
 * 3. Prefixed text: "Here's the result: {...}"
 * 4. Broken JSON: attempts partial recovery
 */
export function parseAgentResponse(rawText: string): AgentResponse {
  let cleaned = rawText.trim();

  // Strategy 1: Extract from markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Strategy 2: Find the outermost JSON object
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  // Strategy 3: Try parsing directly
  try {
    const parsed = JSON.parse(cleaned);
    return normalizeResponse(parsed);
  } catch {
    // Strategy 4: Try to fix common JSON issues
  }

  // Strategy 4: Fix unescaped newlines in string values (common AI mistake)
  try {
    // Replace literal newlines inside string values with \n
    const fixed = cleaned
      .replace(/:\s*"([^"]*?)"/g, (match, val) => {
        return `: "${val.replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
      });
    const parsed = JSON.parse(fixed);
    return normalizeResponse(parsed);
  } catch {
    // Strategy 5: Try to extract just the actions array
  }

  // Strategy 5: Look for actions array pattern
  try {
    const actionsMatch = cleaned.match(/"actions"\s*:\s*(\[[\s\S]*?\])/);
    const messageMatch = cleaned.match(/"message"\s*:\s*"([^"]*?)"/);
    if (actionsMatch) {
      const actions = JSON.parse(actionsMatch[1]);
      return {
        thinking: "",
        actions: Array.isArray(actions) ? actions : [],
        message: messageMatch ? messageMatch[1] : "Changes applied.",
        needs_iteration: false,
      };
    }
  } catch {
    // All JSON strategies failed
  }

  // Strategy 6: If response looks like it contains useful text but no valid JSON,
  // treat the entire response as a conversational message (no file actions)
  const cleanedText = rawText
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .replace(/^\s*\{[\s\S]*$/, "") // Remove broken JSON
    .trim();

  return {
    thinking: "",
    actions: [],
    message: cleanedText.length > 0
      ? (cleanedText.length > 600 ? cleanedText.slice(0, 600) + "..." : cleanedText)
      : "I couldn't process that request. Please try rephrasing.",
    needs_iteration: false,
  };
}

function normalizeResponse(parsed: Record<string, unknown>): AgentResponse {
  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];

  // Filter out actions with placeholder/stub content
  const validActions = actions.filter((a: AgentAction) => {
    if (a.type === "delete_file") return true;
    if (!a.path) return false;
    if (a.type === "create_file" || a.type === "edit_file") {
      // Reject stubs — content must be real code, not placeholders
      if (!a.content || a.content.trim().length < 10) return false;
      if (a.content.trim() === "// ..." || a.content.trim() === "/* TODO */") return false;
    }
    return true;
  });

  return {
    thinking: typeof parsed.thinking === "string" ? parsed.thinking : "",
    actions: validActions as AgentAction[],
    message: typeof parsed.message === "string" ? parsed.message : "Done.",
    needs_iteration: !!parsed.needs_iteration,
  };
}

// ─────────────────────────────────────────
// Main Agent Call (client-side → proxies via /api/agent-turn)
// ─────────────────────────────────────────

export async function runAgentTurn(
  userMessage: string,
  vfs: VirtualFileSystem,
  projectName: string,
  history: ConversationTurn[],
  apiKey: string,
  onAction?: (action: AgentAction) => void
): Promise<AgentResponse> {
  const systemPrompt = buildSystemPrompt(vfs, projectName, history);
  const fullPrompt = `${systemPrompt}\n\nUSER REQUEST: ${userMessage}`;

  // POST to the server-side proxy route to avoid CORS issues with the Raiden API
  const response = await fetch("/api/agent-turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: fullPrompt }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `Agent API error: ${response.status}`);
  }

  const { rawText } = await response.json();
  const parsed = parseAgentResponse(rawText);

  // Fire action callbacks for progressive updates
  if (onAction) {
    for (const action of parsed.actions) {
      onAction(action);
    }
  }

  return parsed;
}

// ─────────────────────────────────────────
// File System Access API — read existing project
// ─────────────────────────────────────────

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".turbo",
  "coverage",
  "__pycache__",
]);

const MAX_FILE_SIZE = 200_000; // 200KB per file

export async function readDirectoryToVFS(
  dirHandle: FileSystemDirectoryHandle,
  basePath = "",
  depth = 0
): Promise<VirtualFileSystem> {
  if (depth > 5) return {};
  const vfs: VirtualFileSystem = {};

  for await (const [name, handle] of (dirHandle as any).entries()) {
    if (EXCLUDED_DIRS.has(name)) continue;
    const fullPath = basePath ? `${basePath}/${name}` : name;

    if (handle.kind === "directory") {
      const nested = await readDirectoryToVFS(handle, fullPath, depth + 1);
      Object.assign(vfs, nested);
    } else if (handle.kind === "file") {
      try {
        const file = await handle.getFile();
        if (file.size > MAX_FILE_SIZE) {
          vfs[fullPath] = `// [File too large to display: ${(file.size / 1024).toFixed(0)}KB]`;
        } else {
          const text = await file.text();
          if (!isBinaryContent(text)) {
            vfs[fullPath] = text;
          }
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  return vfs;
}

function isBinaryContent(text: string): boolean {
  let nonPrintable = 0;
  const sample = text.slice(0, 512);
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0 || (code < 9 && code !== 0)) nonPrintable++;
  }
  return nonPrintable / sample.length > 0.1;
}
