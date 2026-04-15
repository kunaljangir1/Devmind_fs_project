/**
 * lib/project-context.ts — Project Context Engine
 *
 * Generates a compact, AI-written context summary for a project by analyzing
 * its VFS (Virtual File System). This context is:
 *   1. Generated once after project initialization (scratch or existing)
 *   2. Saved to localStorage under devmind_project_context_<chatId>
 *   3. Read before every agent turn to enrich the prompt
 *   4. Regenerated on-demand if missing (e.g. after a cache miss)
 *
 * The context allows the agent to make intelligent decisions:
 *   - Understand the tech stack before creating files
 *   - Know existing key files to avoid duplication
 *   - Follow the project's established conventions
 */

import type { VirtualFileSystem } from "./agent-engine";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export interface ProjectContext {
  /** Display name of the project */
  projectName: string;
  /** Detected tech stack e.g. ["Next.js 14", "TypeScript", "Tailwind CSS"] */
  techStack: string[];
  /** Most important files in the project e.g. ["app/layout.tsx", "package.json"] */
  keyFiles: string[];
  /** One-sentence description of what the project does */
  purpose: string;
  /** Observed coding conventions e.g. "Uses server components, kebab-case filenames" */
  conventions: string;
  /** Total number of files in VFS at the time of generation */
  fileCount: number;
  /** ISO 8601 timestamp of when this context was generated */
  generatedAt: string;
}

const CONTEXT_STORAGE_PREFIX = "devmind_project_context_";

// ─────────────────────────────────────────
// localStorage helpers
// ─────────────────────────────────────────

/**
 * Persist the project context to localStorage.
 * Key format: devmind_project_context_<chatId>
 */
export function saveProjectContext(chatId: string | number, context: ProjectContext): void {
  console.log(`[CONTEXT] 💾 Saving context for project "${context.projectName}" (chatId: ${chatId})`);
  try {
    localStorage.setItem(`${CONTEXT_STORAGE_PREFIX}${chatId}`, JSON.stringify(context));
    console.log(`[CONTEXT] ✅ Context saved successfully. Tech stack: [${context.techStack.join(", ")}]`);
  } catch (err) {
    console.error("[CONTEXT] ❌ Failed to save context to localStorage:", err);
  }
}

/**
 * Load a previously generated context from localStorage.
 * Returns null if not found or if parsing fails.
 */
export function loadProjectContext(chatId: string | number): ProjectContext | null {
  console.log(`[CONTEXT] 📂 Attempting to load context for chatId: ${chatId}`);
  try {
    const raw = localStorage.getItem(`${CONTEXT_STORAGE_PREFIX}${chatId}`);
    if (!raw) {
      console.log(`[CONTEXT] ⚠️  Cache miss — no context found for chatId: ${chatId}`);
      return null;
    }
    const parsed = JSON.parse(raw) as ProjectContext;
    console.log(`[CONTEXT] ✅ Cache hit — loaded context for "${parsed.projectName}" (generated: ${parsed.generatedAt})`);
    console.log(`[CONTEXT] 📋 Key files: [${parsed.keyFiles.join(", ")}]`);
    return parsed;
  } catch (err) {
    console.error("[CONTEXT] ❌ Failed to parse stored context:", err);
    return null;
  }
}

/**
 * Remove a stored context. Call when project is reset.
 */
export function clearProjectContext(chatId: string | number): void {
  console.log(`[CONTEXT] 🗑️  Clearing context for chatId: ${chatId}`);
  localStorage.removeItem(`${CONTEXT_STORAGE_PREFIX}${chatId}`);
}

// ─────────────────────────────────────────
// Context generation
// ─────────────────────────────────────────

/**
 * Builds a compact file-structure summary from the VFS for the AI prompt.
 * Limits output to avoid blowing the token budget.
 */
function buildStructureSummary(vfs: VirtualFileSystem): string {
  const paths = Object.keys(vfs);
  console.log(`[CONTEXT] 🗂️  Reading file structure — ${paths.length} files detected`);

  // Group paths by top-level folder for a cleaner summary
  const grouped: Record<string, string[]> = {};
  for (const p of paths) {
    const parts = p.split("/");
    const top = parts.length > 1 ? parts[0] : "(root)";
    if (!grouped[top]) grouped[top] = [];
    grouped[top].push(p);
  }

  const lines: string[] = [];
  for (const [folder, files] of Object.entries(grouped)) {
    lines.push(`${folder}/`);
    // Show up to 6 files per folder to stay concise
    files.slice(0, 6).forEach((f) => lines.push(`  ${f}`));
    if (files.length > 6) lines.push(`  ... (${files.length - 6} more)`);
  }

  console.log(`[CONTEXT] 📁 Structure summary built (${lines.length} lines, ${paths.length} total files)`);
  return lines.join("\n");
}

/**
 * Builds a sample of file contents for the AI to analyze.
 * Only includes text-heavy, context-rich files like package.json, README.md,
 * tsconfig, main layout/entry files.
 */
function buildContentSample(vfs: VirtualFileSystem): string {
  const PRIORITY_PATTERNS = [
    "package.json",
    "README.md",
    "tsconfig.json",
    ".env.example",
    "app/layout.tsx",
    "app/layout.ts",
    "app/page.tsx",
    "index.ts",
    "index.js",
    "src/index.tsx",
    "src/App.tsx",
  ];

  const sampled: string[] = [];
  let totalChars = 0;
  const CHAR_BUDGET = 2500;

  // First pass: priority files
  for (const pattern of PRIORITY_PATTERNS) {
    const match = Object.keys(vfs).find((k) => k === pattern || k.endsWith(`/${pattern}`));
    if (match && vfs[match] && totalChars < CHAR_BUDGET) {
      const content = vfs[match].slice(0, 500); // up to 500 chars per file
      sampled.push(`### ${match}\n\`\`\`\n${content}\n\`\`\``);
      totalChars += content.length;
      console.log(`[CONTEXT] 🔍 Analyzing file: ${match} (${content.length} chars)`);
    }
  }

  // Second pass: fill remaining budget with other files
  for (const [path, content] of Object.entries(vfs)) {
    if (totalChars >= CHAR_BUDGET) break;
    if (sampled.some((s) => s.includes(`### ${path}`))) continue;
    const snippet = content.slice(0, 300);
    sampled.push(`### ${path}\n\`\`\`\n${snippet}\n\`\`\``);
    totalChars += snippet.length;
    console.log(`[CONTEXT] 🔍 Analyzing file: ${path} (${snippet.length} chars)`);
  }

  console.log(`[CONTEXT] 📊 Content sample built — ${sampled.length} files analyzed, ${totalChars} chars total`);
  return sampled.join("\n\n");
}

/**
 * Calls the /api/agent-turn endpoint to generate a ProjectContext via AI.
 * The prompt instructs the AI to return a strict JSON object only.
 *
 * @param vfs - The current Virtual File System
 * @param projectName - The name of the project
 * @returns A parsed ProjectContext, or a fallback context on failure
 */
export async function generateProjectContext(
  vfs: VirtualFileSystem,
  projectName: string
): Promise<ProjectContext> {
  const fileCount = Object.keys(vfs).length;
  console.log(`[CONTEXT] 🚀 Starting context generation for "${projectName}" (${fileCount} files)`);

  const structureSummary = buildStructureSummary(vfs);
  const contentSample = buildContentSample(vfs);

  const prompt = `You are a code analysis assistant. Analyze the following project and return ONLY a valid JSON object — no markdown, no explanation.

Project name: "${projectName}"
File count: ${fileCount}

## File Structure
${structureSummary}

## Key File Contents
${contentSample}

Return EXACTLY this JSON shape:
{
  "techStack": ["list", "of", "technologies"],
  "keyFiles": ["up to 6 most important file paths"],
  "purpose": "one sentence describing what this project does",
  "conventions": "observed code style and architectural conventions in one sentence"
}`;

  console.log(`[CONTEXT] 📡 Calling AI to analyze project structure...`);

  try {
    const response = await fetch("/api/agent-turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const { rawText } = await response.json();
    console.log(`[CONTEXT] 📥 AI response received (${rawText?.length ?? 0} chars)`);

    // Extract JSON from the response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON object found in AI response");

    const parsed = JSON.parse(jsonMatch[0]) as {
      techStack?: string[];
      keyFiles?: string[];
      purpose?: string;
      conventions?: string;
    };

    const context: ProjectContext = {
      projectName,
      techStack: Array.isArray(parsed.techStack) ? parsed.techStack : ["Unknown"],
      keyFiles: Array.isArray(parsed.keyFiles) ? parsed.keyFiles : Object.keys(vfs).slice(0, 6),
      purpose: typeof parsed.purpose === "string" ? parsed.purpose : "No description available",
      conventions: typeof parsed.conventions === "string" ? parsed.conventions : "No conventions detected",
      fileCount,
      generatedAt: new Date().toISOString(),
    };

    console.log(`[CONTEXT] ✅ Context generation complete!`);
    console.log(`[CONTEXT]    Purpose: ${context.purpose}`);
    console.log(`[CONTEXT]    Tech stack: [${context.techStack.join(", ")}]`);
    console.log(`[CONTEXT]    Key files: [${context.keyFiles.join(", ")}]`);
    console.log(`[CONTEXT]    Conventions: ${context.conventions}`);

    return context;
  } catch (err) {
    console.error("[CONTEXT] ❌ AI context generation failed, using fallback:", err);

    // Fallback: build a basic context from the VFS without AI
    const fallback: ProjectContext = {
      projectName,
      techStack: inferTechStackFromVFS(vfs),
      keyFiles: Object.keys(vfs).slice(0, 6),
      purpose: `A ${projectName} project with ${fileCount} files`,
      conventions: "Conventions could not be determined automatically",
      fileCount,
      generatedAt: new Date().toISOString(),
    };

    console.log(`[CONTEXT] 🔄 Using fallback context — tech stack inferred as: [${fallback.techStack.join(", ")}]`);
    return fallback;
  }
}

/**
 * Infers the tech stack from file extensions and known config files
 * without needing AI — used as a fallback.
 */
function inferTechStackFromVFS(vfs: VirtualFileSystem): string[] {
  const paths = Object.keys(vfs).join(" ");
  const stack: string[] = [];

  if (paths.includes("package.json")) stack.push("Node.js");
  if (paths.match(/\.tsx?/)) stack.push("TypeScript");
  if (paths.includes("next.config") || paths.includes("app/layout")) stack.push("Next.js");
  if (paths.match(/tailwind\.config/)) stack.push("Tailwind CSS");
  if (paths.match(/prisma\//)) stack.push("Prisma");
  if (paths.match(/\.py$/)) stack.push("Python");
  if (paths.match(/requirements\.txt/)) stack.push("Python");

  return stack.length > 0 ? stack : ["Unknown"];
}
