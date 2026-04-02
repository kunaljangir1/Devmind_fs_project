"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { toast } from "sonner";

export default function ChatSessionPage() {
  const { id } = useParams();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchWithAuth(`/chats/${id}/messages`)
      .then((data) => setMessages(data))
      .catch((err) => toast.error("Error loading messages: " + err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    const userMessage = inputVal;
    setInputVal("");
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: userMessage }]);

    try {
      const newDocs = await fetchWithAuth(`/chats/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: userMessage }),
      });
      // The API returns the user message and AI response array.
      // We can just append the AI response since we optimistically appended user.
      const aiResponse = newDocs.find((m: any) => m.role === "ai");
      if (aiResponse) {
        setMessages((prev) => [...prev, aiResponse]);
      }
    } catch (err: any) {
      toast.error("Error sending message: " + err.message);
      // rollback
      setMessages((prev) => prev.filter((m) => m.content !== userMessage));
    }
  };

  return (
    <div className="flex flex-col h-full bg-background font-mono text-sm">
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 pb-24"
      >
        {messages.map((msg, i) => (
          <div
            key={msg.id || i}
            className={`flex flex-col max-w-3xl mx-auto w-full space-y-1 ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <span className="text-xs text-muted-foreground uppercase tracking-widest pl-2 font-bold opacity-70">
              {msg.role === "user" ? "You" : "DevMind"}
            </span>
            <div
              className={`p-4 rounded-xl max-w-[85%] whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                  : "bg-muted text-foreground border border-border rounded-tl-sm dark:bg-card/40"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-muted-foreground animate-pulse">
            Loading context...
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent pt-10 border-t border-border/10">
        <form
          onSubmit={sendMessage}
          className="max-w-3xl mx-auto relative flex items-center bg-card shadow-sm border border-border overflow-hidden rounded-xl"
        >
          <Input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Send a message..."
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 shadow-none px-4 py-6 text-foreground resize-none"
            autoFocus
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputVal.trim()}
            className="mr-2 h-10 w-10 text-primary-foreground bg-primary transition-all duration-200"
          >
            <Send size={18} />
          </Button>
        </form>
      </div>
    </div>
  );
}
