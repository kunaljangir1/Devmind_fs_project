"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Send, Bot, Loader2, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useAgent } from "../../agent-context";
import { runAgentTurn, type AgentAction } from "@/lib/agent-engine";


export default function AgentChatPage() {
  const { id } = useParams();
  const chatId = Array.isArray(id) ? id[0] : id;

  const [messages, setMessages] = useState<{ id?: number; role: string; content: string }[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { vfs, applyActions, addLogEntry, addConversationTurn, conversationHistory, projectName, projectMode, setProjectMode } = useAgent();

  useEffect(() => {
    if (!chatId) return;

    setLoading(true);
    setMessages([]);
    fetchWithAuth(`/chats/${chatId}/messages`)
      .then(setMessages)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [chatId, projectMode, setProjectMode]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputVal.trim() || agentRunning) return;

    const userMessage = inputVal;
    setInputVal("");
    setAgentRunning(true);

    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: userMessage }]);
    addLogEntry({ type: "user", text: `▶ ${userMessage}` });
    addConversationTurn({ role: "user", content: userMessage });

    const placeholderId = Date.now() + 1;
    setMessages((prev) => [...prev, { id: placeholderId, role: "ai", content: "⏳ Thinking..." }]);

    try {
      // No API key needed — the agent turn is proxied via /api/agent-turn server-side

      const agentResponse = await runAgentTurn(
        userMessage, vfs, projectName, conversationHistory, "",
        (action: AgentAction) => {
          if (action.type === "create_file" && action.path) addLogEntry({ type: "create_file", text: `+ ${action.path}`, path: action.path });
          else if (action.type === "edit_file" && action.path) addLogEntry({ type: "edit_file", text: `~ ${action.path}`, path: action.path });
          else if (action.type === "delete_file" && action.path) addLogEntry({ type: "delete_file", text: `- ${action.path}`, path: action.path });
        }
      );

      applyActions(agentResponse.actions);

      setMessages((prev) =>
        prev.map((m) => m.id === placeholderId ? { ...m, content: agentResponse.message } : m)
      );
      addConversationTurn({ role: "agent", content: agentResponse.message });
      addLogEntry({ type: "system", text: `✓ ${agentResponse.actions.length} action(s) applied` });

      // Persist to backend (for conversation history display)
      try {
        await fetchWithAuth(`/chats/${chatId}/messages`, {
          method: "POST",
          body: JSON.stringify({ content: userMessage }),
        });
      } catch {}
    } catch (err: any) {
      const errMsg = err.message || "Agent error";
      setMessages((prev) => prev.map((m) => m.id === placeholderId ? { ...m, content: `❌ ${errMsg}` } : m));
      addLogEntry({ type: "system", text: `✗ ${errMsg}` });
    } finally {
      setAgentRunning(false);
    }
  };

  // Group messages into exchange pairs for history header
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
                <Loader2 className="w-3 h-3 animate-spin" /> working...
              </span>
            )}
          </span>
          {conversationPairs.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {conversationPairs.length} msg{conversationPairs.length !== 1 ? "s" : ""}
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-[12px]">
        {loading && <div className="text-muted-foreground animate-pulse text-xs text-center pt-4">Loading...</div>}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 opacity-40">
            <Bot className="w-8 h-8" />
            <p className="text-xs text-center">Describe what you want to build or change</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={msg.id || i} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
            <span className="text-[10px] pl-1 font-semibold text-muted-foreground uppercase opacity-70 tracking-widest">
              {msg.role === "user" ? "You" : "DevMind"}
            </span>
            <div className={`p-2.5 rounded-lg max-w-[92%] text-[12px] leading-relaxed whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-tr-none"
                : "bg-muted text-foreground border border-border dark:bg-card/40 rounded-tl-none"
            }`}>
              {msg.content}
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
            placeholder="Add a login page, fix the navbar, create API route..."
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
