"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type {
  VirtualFileSystem,
  AgentAction,
  AgentLogEntry,
  ConversationTurn,
} from "@/lib/agent-engine";
import { applyActionsToVFS } from "@/lib/agent-engine";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

type ProjectMode = "scratch" | "existing" | null;

type BuilderContextType = {
  // Builder mode toggle
  isBuilderMode: boolean;
  setIsBuilderMode: (val: boolean) => void;

  // Project chat tracking (persisted in localStorage)
  projectChatIds: Set<number>;
  addProjectChatId: (id: number) => void;
  currentProjectId: number | null;
  setCurrentProjectId: (id: number | null) => void;

  // Project identity
  projectName: string;
  setProjectName: (name: string) => void;
  projectMode: ProjectMode;
  setProjectMode: (mode: ProjectMode) => void;

  // Virtual File System
  vfs: VirtualFileSystem;
  setVfs: (vfs: VirtualFileSystem) => void;
  applyActions: (actions: AgentAction[]) => void;
  activeFile: string | null;
  setActiveFile: (path: string | null) => void;

  // Agent log (terminal output)
  agentLog: AgentLogEntry[];
  addLogEntry: (entry: Omit<AgentLogEntry, "timestamp">) => void;
  clearLog: () => void;

  // Conversation history per project (for agent context)
  conversationHistory: ConversationTurn[];
  addConversationTurn: (turn: ConversationTurn) => void;
};

// ─────────────────────────────────────────
// Context
// ─────────────────────────────────────────

const BuilderContext = createContext<BuilderContextType>({
  isBuilderMode: false,
  setIsBuilderMode: () => {},
  projectChatIds: new Set(),
  addProjectChatId: () => {},
  currentProjectId: null,
  setCurrentProjectId: () => {},
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
  clearLog: () => {},
  conversationHistory: [],
  addConversationTurn: () => {},
});

// ─────────────────────────────────────────
// Provider
// ─────────────────────────────────────────

const STORAGE_KEY = "devmind_project_chat_ids";

export function BuilderProvider({ children }: { children: React.ReactNode }) {
  const [isBuilderMode, setIsBuilderMode] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState("Untitled Project");
  const [projectMode, setProjectMode] = useState<ProjectMode>(null);
  const [vfs, setVfs] = useState<VirtualFileSystem>({});
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [agentLog, setAgentLog] = useState<AgentLogEntry[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);

  const [projectChatIds, setProjectChatIds] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored) as number[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const addProjectChatId = useCallback((id: number) => {
    setProjectChatIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);

  const applyActions = useCallback((actions: AgentAction[]) => {
    setVfs((prev) => applyActionsToVFS(prev, actions));
  }, []);

  const addLogEntry = useCallback((entry: Omit<AgentLogEntry, "timestamp">) => {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    setAgentLog((prev) => [...prev, { ...entry, timestamp }]);
  }, []);

  const clearLog = useCallback(() => setAgentLog([]), []);

  const addConversationTurn = useCallback((turn: ConversationTurn) => {
    setConversationHistory((prev) => [...prev.slice(-20), turn]); // keep last 20 turns
  }, []);

  // Reset project state when builder mode is turned off
  const handleSetBuilderMode = useCallback((val: boolean) => {
    setIsBuilderMode(val);
    if (!val) {
      setProjectMode(null);
      setVfs({});
      setActiveFile(null);
      setAgentLog([]);
      setConversationHistory([]);
      setProjectName("Untitled Project");
    }
  }, []);

  return (
    <BuilderContext.Provider
      value={{
        isBuilderMode,
        setIsBuilderMode: handleSetBuilderMode,
        projectChatIds,
        addProjectChatId,
        currentProjectId,
        setCurrentProjectId,
        projectName,
        setProjectName,
        projectMode,
        setProjectMode,
        vfs,
        setVfs,
        applyActions,
        activeFile,
        setActiveFile,
        agentLog,
        addLogEntry,
        clearLog,
        conversationHistory,
        addConversationTurn,
      }}
    >
      {children}
    </BuilderContext.Provider>
  );
}

export function useBuilder() {
  return useContext(BuilderContext);
}
