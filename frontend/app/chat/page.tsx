"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Sparkles } from "lucide-react";
import { useBuilder } from "./builder-context";

export default function ChatIndexPage() {
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { isBuilderMode, addProjectChatId, setCurrentProjectId } = useBuilder();

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    setLoading(true);

    try {
      // Create new chat
      const chat = await fetchWithAuth("/chats", {
        method: "POST",
        body: JSON.stringify({ title: inputVal.substring(0, 40) + "..." }),
      });
      // Immediately send the first message to backend
      await fetchWithAuth(`/chats/${chat.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: inputVal }),
      });
      // If in builder mode, tag this as a project chat
      if (isBuilderMode) {
        addProjectChatId(chat.id);
        setCurrentProjectId(chat.id);
      }
      // Redirect to the new chat to let it fetch and stream AI natively
      router.push(`/chat/${chat.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create chat");
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground p-4 bg-background relative font-sans">
      <div className="text-center space-y-6 w-full max-w-2xl absolute bottom-[45%] translate-y-[50%] transition-all duration-700 ease-in-out px-4">
        
        {/* Welcome Header */}
        <div className="flex flex-col items-center mb-8">
           <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 ring-1 ring-primary/20 shadow-lg shadow-primary/5">
             <Sparkles className="w-8 h-8 text-primary" />
           </div>
           <h2 className="text-2xl font-semibold text-foreground tracking-tight">What do you want to build today?</h2>
           <p className="mt-2 text-sm max-w-sm">I'm DevMind, your AI engineering assistant. Let's create something amazing.</p>
        </div>

        {/* Input Bar */}
        <form
          onSubmit={handleSend}
          className="relative flex items-center bg-card shadow-2xl border border-border overflow-hidden rounded-xl ring-1 ring-primary/5 focus-within:ring-primary/40 focus-within:shadow-primary/5 transition-all duration-300 mx-auto w-full"
        >
          <Input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Build me a modern dashboard..."
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 shadow-none px-5 py-4 h-auto text-foreground resize-none text-sm"
            autoFocus
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputVal.trim() || loading}
            className="mx-2 h-10 w-10 rounded-xl text-primary-foreground bg-primary transition-all duration-200 shadow-md flex-shrink-0 cursor-pointer"
          >
            {loading ? <span className="animate-pulse flex items-center justify-center"><Sparkles size={16}/></span> : <Send size={18} />}
          </Button>
        </form>
        
        <div className="flex gap-2 justify-center mt-6 flex-wrap">
           <span className="whitespace-nowrap px-3 py-1.5 rounded-full border border-border bg-card text-xs text-muted-foreground cursor-pointer hover:bg-accent transition-colors" onClick={() => setInputVal("Build a landing page for my SAAS with dark mode")}>Build a Landing Page</span>
           <span className="whitespace-nowrap px-3 py-1.5 rounded-full border border-border bg-card text-xs text-muted-foreground cursor-pointer hover:bg-accent transition-colors" onClick={() => setInputVal("Create an authentication flow template")}>Authentication Flow</span>
        </div>

      </div>
    </div>
  );
}
