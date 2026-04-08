"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Send, Bot, Loader2, ChevronDown, ChevronUp,
  MessageSquare, FileCode2, RefreshCw, Sparkles, Trash2, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { useAgent } from "../../agent-context";
import { runAgentTurn, type AgentAction, type AgentResponse } from "@/lib/agent-engine";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

interface ChatMessage {
  id?: number;
  role: string;
  content: string;
  actions?: AgentAction[];
  thinking?: string;
  error?: boolean;
}

// ─────────────────────────────────────────
// Suggestion Chips
// ─────────────────────────────────────────

const SUGGESTIONS = [
  "Create a landing page with hero section, features, and footer",
  "Add a dark-themed login page with email and password",
  "Build a dashboard with sidebar navigation and charts",
  "Create a REST API with CRUD routes for a todo app",
  "Add a responsive navbar with mobile hamburger menu",
];

// ─────────────────────────────────────────
// File Action Badge Component
// ─────────────────────────────────────────

function FileActionBadge({
  action,
  onFileClick,
}: {
  action: AgentAction;
  onFileClick: (path: string) => void;
}) {
  if (!action.path) return null;

  const icons = {
    create_file: <FileCode2 className="w-3 h-3 text-emerald-400" />,
    edit_file: <Pencil className="w-3 h-3 text-blue-400" />,
    delete_file: <Trash2 className="w-3 h-3 text-red-400" />,
  };

  const colors = {
    create_file: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
    edit_file: "border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20",
    delete_file: "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
  };

  return (
    <button
      onClick={() => action.path && onFileClick(action.path)}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-mono transition-colors cursor-pointer ${
        colors[action.type as keyof typeof colors] || ""
      }`}
    >
      {icons[action.type as keyof typeof icons]}
      {action.path.split("/").pop()}
    </button>
  );
}

// ─────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────

export default function AgentChatPage() {
  const { id } = useParams();
  const chatId = Array.isArray(id) ? id[0] : id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    vfs, applyActions, addLogEntry, addConversationTurn,
    conversationHistory, projectName, projectMode, setProjectMode,
    setActiveFile,
  } = useAgent();

  // Load messages from backend
  useEffect(() => {
    if (!chatId) return;
    setLoading(true);
    setMessages([]);
    fetchWithAuth(`/chats/${chatId}/messages`)
      .then(setMessages)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [chatId, projectMode, setProjectMode]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Handle file click from action badges
  const handleFileClick = useCallback((path: string) => {
    setActiveFile(path);
  }, [setActiveFile]);

  // ─── Send Message + Agent Turn ───
  const executeAgentTurn = useCallback(async (userMessage: string) => {
    setAgentRunning(true);
    setLastFailedPrompt(null);

    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: userMessage }]);
    addLogEntry({ type: "user", text: `▶ ${userMessage}` });
    addConversationTurn({ role: "user", content: userMessage });

    const placeholderId = Date.now() + 1;
    setMessages((prev) => [
      ...prev,
      { id: placeholderId, role: "ai", content: "⏳ Analyzing your request..." },
    ]);

    try {
      const agentResponse: AgentResponse = await runAgentTurn(
        userMessage, vfs, projectName, conversationHistory, "",
        (action: AgentAction) => {
          if (action.type === "create_file" && action.path) {
            addLogEntry({ type: "create_file", text: `+ ${action.path}`, path: action.path });
          } else if (action.type === "edit_file" && action.path) {
            addLogEntry({ type: "edit_file", text: `~ ${action.path}`, path: action.path });
          } else if (action.type === "delete_file" && action.path) {
            addLogEntry({ type: "delete_file", text: `- ${action.path}`, path: action.path });
          }
        }
      );

      // Apply file actions to the VFS
      applyActions(agentResponse.actions);

      // Auto-select the first created/edited file so user sees results immediately
      const firstCreated = agentResponse.actions.find(
        (a) => a.type === "create_file" && a.path
      );
      if (firstCreated?.path) {
        setActiveFile(firstCreated.path);
      }

      // Update the placeholder message with the agent's response + action badges
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? {
                ...m,
                content: agentResponse.message,
                actions: agentResponse.actions,
                thinking: agentResponse.thinking,
              }
            : m
        )
      );

      addConversationTurn({ role: "agent", content: agentResponse.message });

      const actionCount = agentResponse.actions.length;
      const actionSummary = actionCount > 0
        ? `✓ ${actionCount} file${actionCount !== 1 ? "s" : ""} updated`
        : "✓ Response ready";
      addLogEntry({ type: "system", text: actionSummary });

      // Persist to backend (skipAI prevents duplicate Gemini call)
      try {
        await fetchWithAuth(`/chats/${chatId}/messages`, {
          method: "POST",
          body: JSON.stringify({
            content: userMessage,
            skipAI: true,
            aiContent: agentResponse.message,
          }),
        });
      } catch {}

    } catch (err: any) {
      const errMsg = err.message || "Agent error";
      setLastFailedPrompt(userMessage);

      const isTimeout = errMsg.includes("timed out") || errMsg.includes("timeout");
      const isNetwork = errMsg.includes("fetch") || errMsg.includes("network") || errMsg.includes("Failed");
      const isAllFailed = errMsg.includes("All fallback models failed");

      let hint = "";
      if (isTimeout) hint = "The AI took too long. Try a simpler request.";
      else if (isNetwork) hint = "Network issue. Check your connection.";
      else if (isAllFailed) hint = "All AI models are busy. Please retry in a moment.";
      else hint = "Something went wrong. Click retry or rephrase your request.";

      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? { ...m, content: hint, error: true }
            : m
        )
      );
      addLogEntry({ type: "system", text: `✗ ${errMsg}` });
    } finally {
      setAgentRunning(false);
    }
  }, [vfs, projectName, conversationHistory, chatId, applyActions, addLogEntry, addConversationTurn, setActiveFile]);

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputVal.trim() || agentRunning) return;
    const msg = inputVal;
    setInputVal("");
    await executeAgentTurn(msg);
  };

  const handleRetry = () => {
    if (lastFailedPrompt && !agentRunning) {
      executeAgentTurn(lastFailedPrompt);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (agentRunning) return;
    setInputVal("");
    executeAgentTurn(suggestion);
  };

  // Group messages into exchange pairs for history accordion
  const conversationPairs = messages.reduce<Array<{ user: string; ai: string }>>((acc, msg, i) => {
    if (msg.role === "user") acc.push({ user: msg.content, ai: messages[i + 1]?.content || "..." });
    return acc;
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Agent Header + History Accordion */}
      <div className="shrink-0 border-b border-border/40 bg-card/30">
        <div
          className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
          onClick={() => conversationPairs.length > 0 && setHistoryOpen(!historyOpen)}
        >
          <span className="text-sm font-semibold flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            Build Agent
            {agentRunning && (
              <span className="flex items-center gap-1 text-xs text-primary/70 font-normal animate-pulse ml-1">
                <Loader2 className="w-3 h-3 animate-spin" /> generating code...
              </span>
            )}
          </span>
          {conversationPairs.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {conversationPairs.length} turn{conversationPairs.length !== 1 ? "s" : ""}
              </span>
              {historyOpen ? <ChevronUp size={12} className="text-muted-foreground" /> : <ChevronDown size={12} className="text-muted-foreground" />}
            </div>
          )}
        </div>
        {historyOpen && conversationPairs.length > 0 && (
          <div className="border-t border-border/40 bg-background/50 max-h-40 overflow-y-auto">
            <div className="px-3 py-2 space-y-1.5">
              {conversationPairs.slice(0, -1).map((pair, i) => (
                <div key={i} className="p-2 rounded-lg border border-border/30 bg-card/30">
                  <div className="flex items-start gap-1.5 mb-0.5">
                    <MessageSquare size={9} className="text-primary mt-0.5 shrink-0" />
                    <p className="text-[10px] text-foreground/90 font-medium line-clamp-1">{pair.user}</p>
                  </div>
                  <div className="flex items-start gap-1.5 pl-3">
                    <Bot size={9} className="text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-[10px] text-muted-foreground line-clamp-1">{pair.ai}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading && <div className="text-muted-foreground animate-pulse text-xs text-center pt-4">Loading...</div>}

        {/* Empty state with suggestions */}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="text-center space-y-2 opacity-70">
              <div className="w-12 h-12 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center ring-1 ring-primary/20">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-medium">What would you like to build?</p>
              <p className="text-[11px] text-muted-foreground">Describe your idea and I&apos;ll generate the code</p>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center max-w-sm">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(s)}
                  className="text-[10px] px-2.5 py-1.5 rounded-lg border border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer line-clamp-1"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message List */}
        {messages.map((msg, i) => (
          <div key={msg.id || i} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
            <span className="text-[10px] pl-1 font-semibold text-muted-foreground uppercase opacity-70 tracking-widest">
              {msg.role === "user" ? "You" : "DevMind"}
            </span>

            <div className={`p-2.5 rounded-lg max-w-[95%] text-[12px] leading-relaxed ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-tr-none"
                : msg.error
                ? "bg-red-500/10 text-red-300 border border-red-500/30 rounded-tl-none"
                : "bg-muted text-foreground border border-border dark:bg-card/40 rounded-tl-none"
            }`}>
              {/* Message content */}
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {/* File action badges */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/30 flex flex-wrap gap-1.5">
                  {msg.actions.map((action, j) => (
                    <FileActionBadge key={j} action={action} onFileClick={handleFileClick} />
                  ))}
                </div>
              )}

              {/* Retry button on error */}
              {msg.error && lastFailedPrompt && (
                <button
                  onClick={handleRetry}
                  disabled={agentRunning}
                  className="mt-2 inline-flex items-center gap-1 text-[10px] text-red-300 hover:text-red-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 bg-background border-t border-border/40 shrink-0">
        <form
          onSubmit={sendMessage}
          className="flex items-end gap-2 border border-border/60 rounded-xl bg-card/50 focus-within:ring-1 focus-within:ring-primary/50 overflow-hidden"
        >
          <textarea
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Build a music player, add auth, create a dashboard..."
            disabled={agentRunning}
            className="flex-1 bg-transparent border-0 resize-none min-h-[44px] max-h-28 text-[12px] p-3 focus:outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(e as any); }
            }}
          />
          <div className="p-1.5">
            <Button type="submit" size="icon" disabled={!inputVal.trim() || agentRunning} className="w-8 h-8 rounded-lg bg-primary text-primary-foreground cursor-pointer">
              {agentRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3" />}
            </Button>
          </div>
        </form>
        <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5">Shift+Enter for new line</p>
      </div>
    </div>
  );
}
