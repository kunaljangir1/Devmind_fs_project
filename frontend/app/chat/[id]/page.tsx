"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { MarkdownRenderer } from "@/components/markdown-renderer";

export default function ChatSessionPage() {
  const { id } = useParams();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatId = Array.isArray(id) ? id[0] : id;

  useEffect(() => {
    if (!chatId) return;
    setLoading(true);
    fetchWithAuth(`/chats/${chatId}/messages`)
      .then((data) => setMessages(data))
      .catch((err) => toast.error("Error loading messages: " + err.message))
      .finally(() => setLoading(false));
  }, [chatId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputVal.trim() || loading || isSending) return;

    const userMessage = inputVal;
    setInputVal("");
    setIsSending(true);
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: userMessage }]);

    // Auto-rename if this is the first message
    if (messages.length === 0) {
      try {
        const title = userMessage.slice(0, 30) + (userMessage.length > 30 ? "..." : "");
        await fetchWithAuth(`/chats/${chatId}`, {
          method: "PATCH",
          body: JSON.stringify({ title }),
        });
        window.dispatchEvent(new CustomEvent("devmind-chats-refresh"));
      } catch {}
    }

    try {
      const newDocs = await fetchWithAuth(`/chats/${chatId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: userMessage }),
      });
      const aiResponse = newDocs.find((m: any) => m.role === "ai");
      if (aiResponse) setMessages((prev) => [...prev, aiResponse]);
    } catch (err: any) {
      toast.error("Error sending message: " + err.message);
      setMessages((prev) => prev.filter((m) => m.content !== userMessage));
    } finally {
      setIsSending(false);
    }
  };

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div className="flex flex-col h-full w-full bg-background relative selection:bg-primary/30 font-sans">

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 font-mono text-sm pt-16 pb-24"
      >
        {loading && (
          <div className="flex items-center justify-center text-muted-foreground animate-pulse h-full">Loading...</div>
        )}
        {messages.map((msg, i) => (
          <div key={msg.id || i} className={`flex flex-col max-w-3xl mx-auto w-full space-y-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
            <span className="text-xs pl-2 font-bold text-muted-foreground uppercase opacity-70 tracking-widest">
              {msg.role === "user" ? "You" : "DevMind"}
            </span>
            <div className={`rounded-xl max-w-[85%] ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-tr-sm p-4 whitespace-pre-wrap font-mono text-sm"
                : "bg-muted/40 text-foreground border border-border/50 dark:bg-card/30 rounded-tl-sm px-5 py-4 text-sm"
            }`}>
              {msg.role === "user" ? (
                msg.content
              ) : (
                <MarkdownRenderer content={msg.content} />
              )}
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex flex-col max-w-3xl mx-auto w-full space-y-1 items-start">
            <span className="text-xs pl-2 font-bold text-muted-foreground uppercase opacity-70 tracking-widest">
              DevMind
            </span>
            <div className="bg-muted/40 text-foreground border border-border/50 dark:bg-card/30 rounded-xl rounded-tl-sm px-5 py-4 text-sm flex items-center gap-2 max-w-[85%]">
              <div className="flex space-x-1.5">
                <div className="h-2 w-2 bg-primary/70 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="h-2 w-2 bg-primary/70 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="h-2 w-2 bg-primary/70 rounded-full animate-bounce"></div>
              </div>
              <span className="text-muted-foreground ml-2 text-xs font-semibold animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input — center when empty, docked at bottom otherwise */}
      <div
        className={`transition-all duration-[800ms] ease-[cubic-bezier(0.23,1,0.32,1)] p-4 z-20
          ${isEmpty
            ? "absolute bottom-[45%] left-0 right-0 translate-y-[50%] bg-transparent pt-0"
            : "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-10"
          }`}
      >
        {isEmpty && (
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-5 ring-1 ring-primary/20">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground tracking-tight">What's on your mind?</h2>
          </div>
        )}
        <form
          onSubmit={sendMessage}
          className={`relative flex items-center shadow-sm overflow-hidden focus-within:ring-1 focus-within:ring-primary/50 transition-all duration-500 ${
            isEmpty ? "max-w-2xl mx-auto bg-card border border-border rounded-xl shadow-2xl" : "max-w-3xl mx-auto bg-card border border-border rounded-xl"
          }`}
        >
          <Input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Send a message..."
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 shadow-none text-foreground px-5 py-4 h-auto text-sm"
            autoFocus
          />
          <Button type="submit" size="icon" disabled={!inputVal.trim() || loading || isSending} className="mx-2 h-10 w-10 rounded-xl bg-primary text-primary-foreground cursor-pointer">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
