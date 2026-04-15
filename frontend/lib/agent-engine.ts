/**
 * lib/agent-engine.ts — DevMind Coding Agent Engine
 *
 * Manages the Virtual File System (VFS), builds structured prompts for Gemini,
 * and parses the agent's JSON-formatted action responses.
 *
 * Project context (ProjectContext) is injected into the system prompt when
 * available, enabling the agent to:
 *   - Know the tech stack before generating code
 *   - Identify existing key files to avoid duplication
 *   - Follow established coding conventions
 *   - Decide intelligently whether to CREATE or MODIFY files
 */

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

// raidenAI is intentionally NOT imported here — it runs server-side only.
// Client-side calls go via POST /api/agent-turn to avoid CORS restrictions.

import type { ProjectContext } from "./project-context";

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

/** A single planned file operation decided in Phase 1 */
export interface AgentOperation {
  /** What to do */
  action: "create" | "modify" | "delete" | "message";
  /** Target file path (relative) */
  path: string;
  /** Brief reason for this decision */
  reason: string;
}

/** The full plan returned by Phase 1 */
export interface AgentPlan {
  thinking: string;
  operations: AgentOperation[];
  /** Optional direct reply (used when action === "message") */
  message?: string;
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
// Phase 1 — Planning Prompt & Parser
// ─────────────────────────────────────────

/**
 * Builds the planning prompt.
 * The AI reads the full file list + project context and returns a JSON plan:
 * which files to CREATE / MODIFY / DELETE and why.
 */
function buildPlanningPrompt(
  userMessage: string,
  vfs: VirtualFileSystem,
  projectName: string,
  projectContext?: ProjectContext | null,
  history?: ConversationTurn[]
): string {
  const paths = Object.keys(vfs);
  // Full path list — planning only needs names, not content
  const fileList = paths.length > 0
    ? paths.map((p) => `  - ${p}`).join("\n")
    : "  (no files yet)";

  let contextBlock = "";
  if (projectContext) {
    contextBlock = `\nProject Context:
- Purpose: ${projectContext.purpose}
- Tech Stack: ${projectContext.techStack.join(", ")}
- Key Files: ${projectContext.keyFiles.join(", ")}
- Conventions: ${projectContext.conventions}\n`;
  }

  const historyStr = history && history.length > 0
    ? `\nRecent conversation:\n${history.slice(-3).map((t) => `${t.role === "user" ? "User" : "Agent"}: ${t.content.slice(0, 120)}`).join("\n")}`
    : "";

  return `You are DevMind, a coding agent. Analyze this request and plan the file operations needed.

Project: "${projectName}" (${paths.length} files)${contextBlock}
Current file structure:
${fileList}${historyStr}

User request: "${userMessage}"

Decision rules:
- Prefer MODIFY over CREATE — if a relevant file already exists, edit it instead of making a new one.
- Only CREATE when the feature is clearly new and no existing file fits.
- Use exact existing paths for modify/delete operations.
- For CREATE, choose paths that match this project's structure and naming conventions.
- If no file changes are needed (question, greeting, etc.), use action "message".

Respond with ONLY valid JSON — no markdown fences:
{"thinking":"<step-by-step reasoning: which files you checked, why you chose create vs modify>","operations":[{"action":"create|modify|delete|message","path":"relative/path/file.tsx","reason":"<brief reason>"}],"message":"<optional short summary for the user>"}`;
}

/** Parse Phase 1 planning response into an AgentPlan */
function parsePlanResponse(rawText: string): AgentPlan {
  let cleaned = rawText.trim();

  // Strip markdown fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  if (startIdx !== -1 && endIdx !== -1) cleaned = cleaned.slice(startIdx, endIdx + 1);

  try {
    const parsed = JSON.parse(cleaned) as AgentPlan;
    return {
      thinking: parsed.thinking ?? "",
      operations: Array.isArray(parsed.operations) ? parsed.operations : [],
      message: parsed.message,
    };
  } catch {
    console.warn("[AGENT] ⚠️  Failed to parse plan JSON — treating as message", cleaned.slice(0, 200));
    return { thinking: "", operations: [{ action: "message", path: "", reason: "fallback" }], message: rawText.slice(0, 400) };
  }
}

// ─────────────────────────────────────────
// Phase 2 — Execution Prompts
// ─────────────────────────────────────────

/**
 * Builds the prompt for CREATE operations.
 * Gives the AI the project structure + context so it places
 * correct imports and follows existing conventions.
 */
function buildCreatePrompt(
  op: AgentOperation,
  userMessage: string,
  vfs: VirtualFileSystem,
  projectName: string,
  projectContext?: ProjectContext | null
): string {
  // Include content of related/sibling files as style reference
  const targetDir = op.path.includes("/") ? op.path.split("/").slice(0, -1).join("/") : "";
  const siblingFiles: string[] = [];
  let siblingContent = "";
  let charBudget = 1500;

  for (const [path, content] of Object.entries(vfs)) {
    const isRelated = targetDir
      ? path.startsWith(targetDir)
      : !path.includes("/"); // root-level neighbors
    if (isRelated && path !== op.path && charBudget > 0) {
      const snippet = content.slice(0, Math.min(400, charBudget));
      siblingContent += `\n### ${path}\n\`\`\`\n${snippet}${content.length > 400 ? "\n...(truncated)" : ""}\n\`\`\``;
      charBudget -= snippet.length;
      siblingFiles.push(path);
    }
  }

  const fileList = Object.keys(vfs).slice(0, 40).map((p) => `  - ${p}`).join("\n");

  let contextBlock = "";
  if (projectContext) {
    contextBlock = `\nProject context:
- Tech Stack: ${projectContext.techStack.join(", ")}
- Conventions: ${projectContext.conventions}\n`;
  }

  return `You are DevMind, a coding agent. Create a new file for this project.

Project: "${projectName}"${contextBlock}
File to create: ${op.path}
Reason: ${op.reason}

User request: "${userMessage}"

Full project structure:
${fileList}${siblingFiles.length > 0 ? `\n\nRelated files for reference (follow their style/imports):
${siblingContent}` : ""}

Write the COMPLETE, production-ready content for "${op.path}".
Follow the existing code style. Use correct import paths (relative to file location).
Return ONLY the raw file content — no JSON, no markdown fences, no explanation.`;
}

/**
 * Builds the prompt for MODIFY operations.
 * Reads the FULL current file content and asks the AI to produce the updated version.
 */
function buildModifyPrompt(
  op: AgentOperation,
  userMessage: string,
  vfs: VirtualFileSystem,
  projectName: string,
  projectContext?: ProjectContext | null
): string {
  const existingContent = vfs[op.path] ?? "";

  let contextBlock = "";
  if (projectContext) {
    contextBlock = `\nProject context:
- Tech Stack: ${projectContext.techStack.join(", ")}
- Conventions: ${projectContext.conventions}\n`;
  }

  return `You are DevMind, a coding agent. Modify an existing file.

Project: "${projectName}"${contextBlock}
File to modify: ${op.path}
Reason: ${op.reason}

User request: "${userMessage}"

Current content of "${op.path}":
\`\`\`
${existingContent}
\`\`\`

Update this file to fulfill the user's request.
Keep all existing functionality intact — only add, change, or remove what's necessary.
Write the COMPLETE updated file content.
Return ONLY the raw file content — no JSON, no markdown fences, no explanation.`;
}

// ─────────────────────────────────────────
// Internal API caller helper
// ─────────────────────────────────────────

async function callAgentAPI(prompt: string, label: string): Promise<string> {
  console.log(`[AGENT] 📡 ${label} — sending prompt (${prompt.length} chars)`);
  const response = await fetch("/api/agent-turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `Agent API error: ${response.status}`);
  }
  const { rawText } = await response.json();
  console.log(`[AGENT] 📥 ${label} — response received (${rawText?.length ?? 0} chars)`);
  return rawText ?? "";
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
// Main Agent Orchestrator — Two-Phase Pipeline
// ─────────────────────────────────────────

/**
 * runAgentTurn — Two-phase agentic pipeline:
 *
 * Phase 1 (Plan): Ask the AI to decide WHAT operations to perform
 *   → which files to create / modify / delete and why
 *
 * Phase 2 (Execute): For each operation, run a targeted AI call:
 *   CREATE  → Read file structure → Generate complete new file content
 *   MODIFY  → Read existing file content → Generate updated content
 *   DELETE  → No AI needed — remove from VFS directly
 *   MESSAGE → No file changes, just return the AI's reply
 *
 * Every step is console-logged for debugging.
 */
export async function runAgentTurn(
  userMessage: string,
  vfs: VirtualFileSystem,
  projectName: string,
  history: ConversationTurn[],
  apiKey: string,
  onAction?: (action: AgentAction) => void,
  projectContext?: ProjectContext | null
): Promise<AgentResponse> {
  console.log(`[AGENT] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[AGENT] 🤖 New agent turn started`);
  console.log(`[AGENT]    Request : "${userMessage.slice(0, 100)}${userMessage.length > 100 ? "..." : ""}"`);
  console.log(`[AGENT]    VFS     : ${Object.keys(vfs).length} files`);
  console.log(`[AGENT]    Context : ${projectContext ? `"${projectContext.purpose.slice(0, 60)}"` : "not available"}`);
  console.log(`[AGENT] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // ──────────────────────────────────────
  // PHASE 1 — Plan
  // ──────────────────────────────────────
  console.log(`[AGENT] 📋 Phase 1: Planning...`);
  const planningPrompt = buildPlanningPrompt(userMessage, vfs, projectName, projectContext, history);
  const planRawText = await callAgentAPI(planningPrompt, "Phase 1 / Plan");
  const plan = parsePlanResponse(planRawText);

  console.log(`[AGENT] 🧠 Thinking: ${plan.thinking.slice(0, 200)}`);
  console.log(`[AGENT] 📝 Plan: ${plan.operations.length} operation(s) decided:`);
  plan.operations.forEach((op, i) => {
    const icon = op.action === "create" ? "➕" : op.action === "modify" ? "✏️" : op.action === "delete" ? "🗑️" : "💬";
    console.log(`[AGENT]    ${i + 1}. ${icon} ${op.action.toUpperCase()} → ${op.path || "(message)"} — ${op.reason}`);
  });

  // ──────────────────────────────────────
  // PHASE 2 — Execute each operation
  // ──────────────────────────────────────
  const actions: AgentAction[] = [];
  const summaryParts: string[] = [];

  for (const op of plan.operations) {
    console.log(`[AGENT] ⚙️  Phase 2: Executing ${op.action.toUpperCase()} → ${op.path || "(message)"}`);

    if (op.action === "delete") {
      // ── DELETE: no AI call needed ──
      if (!op.path || !vfs[op.path]) {
        console.warn(`[AGENT] ⚠️  DELETE skipped — path not found in VFS: "${op.path}"`);
        summaryParts.push(`Could not delete \`${op.path}\` (file not found).`);
        continue;
      }
      console.log(`[AGENT] 🗑️  Removing file: ${op.path}`);
      const deleteAction: AgentAction = { type: "delete_file", path: op.path };
      actions.push(deleteAction);
      if (onAction) onAction(deleteAction);
      summaryParts.push(`Deleted \`${op.path}\`.`);

    } else if (op.action === "create") {
      // ── CREATE: generate complete new file ──
      console.log(`[AGENT] ➕ Creating new file: ${op.path}`);
      console.log(`[AGENT]    Reading file structure for context...`);
      const createPrompt = buildCreatePrompt(op, userMessage, vfs, projectName, projectContext);
      const rawContent = await callAgentAPI(createPrompt, `Phase 2 / Create ${op.path}`);

      // The AI returns raw file content (not JSON)
      const fileContent = rawContent.trim();
      console.log(`[AGENT] ✅ File generated: ${op.path} (${fileContent.length} chars)`);

      const createAction: AgentAction = { type: "create_file", path: op.path, content: fileContent };
      actions.push(createAction);
      if (onAction) onAction(createAction);
      summaryParts.push(`Created \`${op.path}\`.`);

    } else if (op.action === "modify") {
      // ── MODIFY: read existing content, then generate updated version ──
      if (!op.path) {
        console.warn(`[AGENT] ⚠️  MODIFY skipped — no path specified`);
        continue;
      }

      const currentContent = vfs[op.path];
      if (currentContent === undefined) {
        // File doesn't exist — fall back to CREATE
        console.warn(`[AGENT] ⚠️  MODIFY target not found in VFS: "${op.path}" — falling back to CREATE`);
        const createPrompt = buildCreatePrompt(
          { ...op, action: "create" },
          userMessage, vfs, projectName, projectContext
        );
        const rawContent = await callAgentAPI(createPrompt, `Phase 2 / Create (fallback) ${op.path}`);
        const createAction: AgentAction = { type: "create_file", path: op.path, content: rawContent.trim() };
        actions.push(createAction);
        if (onAction) onAction(createAction);
        summaryParts.push(`Created \`${op.path}\` (file was not found, created instead).`);
        continue;
      }

      console.log(`[AGENT] 📖 Reading existing content of: ${op.path} (${currentContent.length} chars)`);
      const modifyPrompt = buildModifyPrompt(op, userMessage, vfs, projectName, projectContext);
      const rawContent = await callAgentAPI(modifyPrompt, `Phase 2 / Modify ${op.path}`);

      const updatedContent = rawContent.trim();
      console.log(`[AGENT] ✅ File updated: ${op.path} (${currentContent.length} → ${updatedContent.length} chars)`);

      const editAction: AgentAction = { type: "edit_file", path: op.path, content: updatedContent };
      actions.push(editAction);
      if (onAction) onAction(editAction);
      summaryParts.push(`Modified \`${op.path}\`.`);

    } else {
      // ── MESSAGE: AI-only response, no file changes ──
      console.log(`[AGENT] 💬 Message-only operation (no file changes)`);
      summaryParts.push(plan.message || planRawText.slice(0, 400));
    }
  }

  // Build final summary message
  const finalMessage = summaryParts.length > 0
    ? summaryParts.join(" ")
    : plan.message || "Done.";

  console.log(`[AGENT] ✅ Turn complete — ${actions.length} action(s) applied`);
  console.log(`[AGENT] 📨 Message: ${finalMessage.slice(0, 150)}`);
  console.log(`[AGENT] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  return {
    thinking: plan.thinking,
    actions,
    message: finalMessage,
    needs_iteration: false,
  };
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
