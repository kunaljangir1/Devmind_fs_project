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
});

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [projectName, setProjectName] = useState("Untitled Project");
  const [projectMode, setProjectMode] = useState<ProjectMode>(null);
  const [vfs, setVfs] = useState<VirtualFileSystem>({});
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [agentLog, setAgentLog] = useState<AgentLogEntry[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  
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
      initializedRef.current = true;
      return;
    }

    try {
      const stored = localStorage.getItem(`devmind_agent_state_${currentChatId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        setProjectName(parsed.projectName || "Untitled Project");
        setProjectMode(parsed.projectMode || null);
        setVfs(parsed.vfs || {});
        setActiveFile(parsed.activeFile || null);
        setAgentLog(parsed.agentLog || []);
        // we'll leave conversationHistory to load from the server to keep it robust against concurrent edits
      } else {
        // Reset if no saved state but keep 'scratch' mode so workspace renders
        setProjectMode("scratch");
        setVfs({});
        setActiveFile(null);
        setAgentLog([]);
        setProjectName("Untitled Project");
      }
    } catch {}
    
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

  const resetProject = useCallback(() => {
    setProjectMode(null);
    setVfs({});
    setActiveFile(null);
    setAgentLog([]);
    setConversationHistory([]);
    setProjectName("Untitled Project");
  }, []);

  return (
    <AgentContext.Provider value={{
      projectName, setProjectName,
      projectMode, setProjectMode,
      vfs, setVfs, applyActions,
      activeFile, setActiveFile,
      agentLog, addLogEntry,
      conversationHistory, addConversationTurn,
      resetProject,
    }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  return useContext(AgentContext);
}
