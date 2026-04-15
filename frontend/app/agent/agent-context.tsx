"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type {
  VirtualFileSystem,
  AgentAction,
  AgentLogEntry,
  ConversationTurn,
} from "@/lib/agent-engine";
import { applyActionsToVFS } from "@/lib/agent-engine";
import type { ProjectContext } from "@/lib/project-context";
import {
  generateProjectContext,
  saveProjectContext,
  loadProjectContext,
  clearProjectContext,
} from "@/lib/project-context";

type ProjectMode = "scratch" | "existing" | null;

type AgentContextType = {
  projectName: string;
  setProjectName: (name: string) => void;
  projectMode: ProjectMode;
  setProjectMode: (mode: ProjectMode) => void;
  vfs: VirtualFileSystem;
  setVfs: (vfs: VirtualFileSystem) => void;
  applyActions: (actions: AgentAction[]) => void;
  activeFile: string | null;
  setActiveFile: (path: string | null) => void;
  agentLog: AgentLogEntry[];
  addLogEntry: (entry: Omit<AgentLogEntry, "timestamp">) => void;
  conversationHistory: ConversationTurn[];
  addConversationTurn: (turn: ConversationTurn) => void;
  resetProject: () => void;
  /** The AI-generated context summary for the current project */
  projectContext: ProjectContext | null;
  /** Triggers context generation and saves it for the current chatId */
  generateAndSaveContext: (vfsOverride?: VirtualFileSystem, nameOverride?: string) => Promise<ProjectContext | null>;
};

const AgentContext = createContext<AgentContextType>({
  projectName: "Untitled Project",
  setProjectName: () => {},
  projectMode: null,
  setProjectMode: () => {},
  vfs: {},
  setVfs: () => {},
  applyActions: () => {},
  activeFile: null,
  setActiveFile: () => {},
  agentLog: [],
  addLogEntry: () => {},
  conversationHistory: [],
  addConversationTurn: () => {},
  resetProject: () => {},
  projectContext: null,
  generateAndSaveContext: async () => null,
});

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [projectName, setProjectName] = useState("Untitled Project");
  const [projectMode, setProjectMode] = useState<ProjectMode>(null);
  const [vfs, setVfs] = useState<VirtualFileSystem>({});
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [agentLog, setAgentLog] = useState<AgentLogEntry[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);

  const pathname = usePathname();
  const currentChatId = pathname?.match(/\/agent\/chat\/(\d+)/)?.[1] || null;
  const initializedRef = useRef(false);

  // Load state when chat ID changes
  useEffect(() => {
    if (!currentChatId) {
      setProjectMode(null);
      setVfs({});
      setActiveFile(null);
      setAgentLog([]);
      setConversationHistory([]);
      setProjectName("Untitled Project");
      setProjectContext(null);
      initializedRef.current = true;
      return;
    }

    console.log(`[CONTEXT] 🔄 Chat ID changed to ${currentChatId} — loading saved state...`);

    try {
      const stored = localStorage.getItem(`devmind_agent_state_${currentChatId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        setProjectName(parsed.projectName || "Untitled Project");
        setProjectMode(parsed.projectMode || null);
        setVfs(parsed.vfs || {});
        setActiveFile(parsed.activeFile || null);
        setAgentLog(parsed.agentLog || []);
        console.log(`[CONTEXT] ✅ Project state restored: "${parsed.projectName}" (${Object.keys(parsed.vfs || {}).length} files)`);

        // Attempt to load existing context from cache
        const cachedContext = loadProjectContext(currentChatId);
        if (cachedContext) {
          setProjectContext(cachedContext);
        } else {
          // No cached context — schedule background generation if VFS has files
          if (parsed.vfs && Object.keys(parsed.vfs).length > 0) {
            console.log(`[CONTEXT] ⏳ No cached context found — scheduling background generation...`);
            setTimeout(async () => {
              try {
                const ctx = await generateProjectContext(parsed.vfs, parsed.projectName || "Untitled Project");
                saveProjectContext(currentChatId, ctx);
                setProjectContext(ctx);
                console.log(`[CONTEXT] 🎉 Background context generation complete!`);
              } catch (err) {
                console.error("[CONTEXT] ❌ Background context generation failed:", err);
              }
            }, 1000); // slight delay to avoid blocking initial render
          }
        }
      } else {
        // Reset if no saved state but keep 'scratch' mode so workspace renders
        setProjectMode("scratch");
        setVfs({});
        setActiveFile(null);
        setAgentLog([]);
        setProjectName("Untitled Project");
        setProjectContext(null);
        console.log(`[CONTEXT] ℹ️  No saved state for chatId ${currentChatId} — starting fresh`);
      }
    } catch (err) {
      console.error("[CONTEXT] ❌ Failed to restore project state:", err);
    }

    // Give react time to apply before triggering auto-saves
    setTimeout(() => { initializedRef.current = true; }, 0);

    return () => { initializedRef.current = false; };
  }, [currentChatId]);

  // Save state when it changes
  useEffect(() => {
    if (!initializedRef.current || !currentChatId) return;

    try {
      const stateToSave = {
        projectName,
        projectMode,
        vfs,
        activeFile,
        agentLog
      };
      localStorage.setItem(`devmind_agent_state_${currentChatId}`, JSON.stringify(stateToSave));
    } catch {}
  }, [currentChatId, projectName, projectMode, vfs, activeFile, agentLog]);

  const applyActions = useCallback((actions: AgentAction[]) => {
    setVfs((prev) => applyActionsToVFS(prev, actions));
  }, []);

  const addLogEntry = useCallback((entry: Omit<AgentLogEntry, "timestamp">) => {
    const ts = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    setAgentLog((prev) => [...prev, { ...entry, timestamp: ts }]);
  }, []);

  const addConversationTurn = useCallback((turn: ConversationTurn) => {
    setConversationHistory((prev) => [...prev.slice(-20), turn]);
  }, []);

  /**
   * Generate and save context for the current project.
   * Accepts optional overrides for the VFS and name (useful during initialization
   * before the state has fully propagated to the context).
   */
  const generateAndSaveContext = useCallback(
    async (vfsOverride?: VirtualFileSystem, nameOverride?: string): Promise<ProjectContext | null> => {
      const targetVfs = vfsOverride ?? vfs;
      const targetName = nameOverride ?? projectName;

      if (Object.keys(targetVfs).length === 0) {
        console.log(`[CONTEXT] ⚠️  generateAndSaveContext called with empty VFS — skipping`);
        return null;
      }

      if (!currentChatId) {
        console.warn(`[CONTEXT] ⚠️  generateAndSaveContext called with no chatId — context will not be saved`);
      }

      console.log(`[CONTEXT] 🔄 generateAndSaveContext called for "${targetName}" (${Object.keys(targetVfs).length} files)`);

      try {
        const ctx = await generateProjectContext(targetVfs, targetName);
        setProjectContext(ctx);
        if (currentChatId) {
          saveProjectContext(currentChatId, ctx);
        }
        return ctx;
      } catch (err) {
        console.error("[CONTEXT] ❌ generateAndSaveContext failed:", err);
        return null;
      }
    },
    [vfs, projectName, currentChatId]
  );

  const resetProject = useCallback(() => {
    if (currentChatId) {
      clearProjectContext(currentChatId);
      console.log(`[CONTEXT] 🗑️  Project reset — context cleared for chatId ${currentChatId}`);
    }
    setProjectMode(null);
    setVfs({});
    setActiveFile(null);
    setAgentLog([]);
    setConversationHistory([]);
    setProjectName("Untitled Project");
    setProjectContext(null);
  }, [currentChatId]);

  return (
    <AgentContext.Provider value={{
      projectName, setProjectName,
      projectMode, setProjectMode,
      vfs, setVfs, applyActions,
      activeFile, setActiveFile,
      agentLog, addLogEntry,
      conversationHistory, addConversationTurn,
      resetProject,
      projectContext,
      generateAndSaveContext,
    }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  return useContext(AgentContext);
}
