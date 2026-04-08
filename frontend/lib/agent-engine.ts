/**
 * lib/agent-engine.ts — DevMind Coding Agent Engine
 *
 * Manages the Virtual File System (VFS), builds structured prompts for Gemini,
 * and parses the agent's JSON-formatted action responses.
 */

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

// raidenAI is intentionally NOT imported here — it runs server-side only.
// Client-side calls go via POST /api/agent-turn to avoid CORS restrictions.

/** Flat map of file paths to their string content */
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

/** Serialize VFS to a readable string for injection into prompts.
 * Budget-aware: aggressively truncates file content to fit within URL limits.
 * @param maxTotalLength - Maximum total character budget for VFS string (default: 3000)
 */
export function serializeVFS(vfs: VirtualFileSystem, maxTotalLength: number = 3000): string {
  const files = Object.entries(vfs);
  if (files.length === 0) return "(empty — no files yet)";

  // Calculate per-file budget
  const headerOverhead = 20; // ### path\n```\n...\n```
  const maxPerFile = Math.min(
    400,
    Math.floor((maxTotalLength - files.length * headerOverhead) / Math.max(files.length, 1))
  );

  const parts: string[] = [];
  let totalLen = 0;

  for (const [path, content] of files) {
    if (totalLen >= maxTotalLength) {
      parts.push(`(${files.length - parts.length} more files omitted)`);
      break;
    }

    const preview = content.length > maxPerFile
      ? content.slice(0, maxPerFile) + "\n...[truncated]"
      : content;
    const entry = `### ${path}\n\`\`\`\n${preview}\n\`\`\``;
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

export function buildSystemPrompt(
  vfs: VirtualFileSystem,
  projectName: string,
  history: ConversationTurn[]
): string {
  // Use compact VFS serialization — budget ~2500 chars for file content
  const vfsStr = serializeVFS(vfs, 2500);

  // Only keep last 4 turns to save space
  const historyStr =
    history.length > 0
      ? history
          .slice(-4)
          .map((t) => `${t.role === "user" ? "U" : "A"}: ${t.content.slice(0, 150)}`)
          .join("\n")
      : "";

  // Compact system prompt — every character counts for URL-based API
  return `You are DevMind, an AI coding agent. Create/edit/delete files in a Virtual File System.

Project: "${projectName}" (${Object.keys(vfs).length} files)

## Files
${vfsStr}
${historyStr ? `\n## History\n${historyStr}` : ""}

## RESPOND WITH ONLY VALID JSON:
{"thinking":"reasoning","actions":[{"type":"create_file","path":"path/file.tsx","content":"full content"},{"type":"edit_file","path":"path","content":"full new content"},{"type":"delete_file","path":"path"}],"message":"explanation","needs_iteration":false}

Rules: Write COMPLETE file content. Use relative paths. Empty actions array if no changes needed.`;
}

// ─────────────────────────────────────────
// Response Parser
// ─────────────────────────────────────────

export function parseAgentResponse(rawText: string): AgentResponse {
  // Strip markdown fences if present
  let cleaned = rawText.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Find the JSON object boundaries
  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  if (startIdx !== -1 && endIdx !== -1) {
    cleaned = cleaned.slice(startIdx, endIdx + 1);
  }

  try {
    const parsed = JSON.parse(cleaned) as AgentResponse;
    return {
      thinking: parsed.thinking ?? "",
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      message: parsed.message ?? "Done.",
      needs_iteration: parsed.needs_iteration ?? false,
    };
  } catch {
    // Fallback: treat entire response as a message with no actions
    return {
      thinking: "",
      actions: [],
      message: rawText.length > 500 ? rawText.slice(0, 500) + "..." : rawText,
      needs_iteration: false,
    };
  }
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
  const fullPrompt = `${systemPrompt}\n\n## User Request\n${userMessage}`;

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
          // Only include text files
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
  // Heuristic: if > 10% null bytes or control chars, likely binary
  let nonPrintable = 0;
  const sample = text.slice(0, 512);
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0 || (code < 9 && code !== 0)) nonPrintable++;
  }
  return nonPrintable / sample.length > 0.1;
}
