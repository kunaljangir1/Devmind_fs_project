"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { MessageSquare, Plus, LogOut, Menu, PanelLeftClose, Trash2, Hammer, Pencil, Check, X, Bot } from "lucide-react";
import { toast } from "sonner";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // IDs that are project chats — exclude from regular chat sidebar
  const [projectIds, setProjectIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);

  const currentChatIdFromUrl = pathname?.match(/\/chat\/(\d+)/)?.[1];

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (!token || !storedUser) { router.push("/login"); return; }
    setUser(JSON.parse(storedUser));

    // Load project IDs from localStorage to filter them out
    try {
      const stored = localStorage.getItem("devmind_project_chat_ids");
      if (stored) setProjectIds(new Set(JSON.parse(stored) as number[]));
    } catch {}

    if (window.innerWidth >= 768) setSidebarOpen(true);
  }, [router]);

  const loadChats = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetchWithAuth("/chats")
      .then((data) => setChats(data))
      .catch(() => {});
  }, []);

  // Re-fetch chat list whenever the URL changes or a custom event is fired
  useEffect(() => {
    loadChats();
  }, [pathname, loadChats]);

  useEffect(() => {
    window.addEventListener("devmind-chats-refresh", loadChats);
    return () => window.removeEventListener("devmind-chats-refresh", loadChats);
  }, [loadChats]);

  // Only show non-project chats in the regular sidebar
  const regularChats = chats.filter((c) => !projectIds.has(c.id));

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const createNewChat = async () => {
    if (creating) return;
    try {
      setCreating(true);
      const data = await fetchWithAuth("/chats", {
        method: "POST",
        body: JSON.stringify({ title: "New Chat Session" }),
      });
      setChats([data, ...chats]);
      router.push(`/chat/${data.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create chat");
    } finally {
      setCreating(false);
    }
  };

  const deleteChat = async (chatId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetchWithAuth(`/chats/${chatId}`, { method: "DELETE" });
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (String(chatId) === currentChatIdFromUrl) router.push("/chat");
    } catch {}
  };

  const startEdit = (chat: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(chat.id);
    setEditVal(chat.title);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const saveEdit = async (chatId: number) => {
    if (editingId !== chatId) return; // prevent duplicate calls
    const trimmed = editVal.trim();
    setEditingId(null);
    if (!trimmed) return;
    
    // optimistically update local UI
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, title: trimmed } : c));
    
    try {
      await fetchWithAuth(`/chats/${chatId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: trimmed }),
      });
      window.dispatchEvent(new CustomEvent("devmind-chats-refresh"));
    } catch {}
  };

  const cancelEdit = () => setEditingId(null);

  return (
    <div className="dark flex h-screen overflow-hidden bg-background font-mono text-foreground">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`absolute md:relative z-30 h-full flex flex-col transition-all duration-300 ease-in-out bg-card/95 backdrop-blur-xl md:bg-card/50 overflow-hidden shrink-0
          ${sidebarOpen
            ? "w-64 translate-x-0 border-r border-border shadow-2xl md:shadow-none"
            : "w-64 -translate-x-full md:w-0 md:translate-x-0 md:border-r-0"}`}
      >
        <div className="flex items-center justify-between p-4 pb-2">
          <div className="flex items-center gap-2">
            <MessageSquare size={13} className="text-muted-foreground" />
            <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Chat History</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setSidebarOpen(false)}>
            <PanelLeftClose size={16} />
          </Button>
        </div>

        <div className="px-4 pb-3">
          <Button onClick={createNewChat} disabled={creating} variant="outline" className="w-full justify-start gap-2 border-border/50 text-muted-foreground hover:text-foreground text-sm h-9">
            {creating ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> Creating...
              </span>
            ) : (
              <><Plus size={14} /> New Chat</>
            )}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          {regularChats.map((chat) => {
            const isActive = String(chat.id) === currentChatIdFromUrl;
            const isEditing = editingId === chat.id;
            return (
              <div key={chat.id} className="group relative">
                {isEditing ? (
                  // ── Inline edit mode ──────────────────────────
                  <div className="flex items-center gap-1 p-1 pr-1 rounded-md bg-muted/30 border border-primary/40">
                    <input
                      ref={editInputRef}
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(chat.id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      onBlur={() => saveEdit(chat.id)}
                      className="flex-1 bg-transparent text-sm text-foreground focus:outline-none px-1 min-w-0"
                    />
                    <button onClick={() => saveEdit(chat.id)} className="p-1 hover:text-emerald-400 text-muted-foreground shrink-0">
                      <Check size={12} />
                    </button>
                    <button onMouseDown={cancelEdit} className="p-1 hover:text-destructive text-muted-foreground shrink-0">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  // ── Normal read mode ──────────────────────────
                  <>
                    <Link href={`/chat/${chat.id}`}>
                      <div className={`flex items-center gap-2 p-2 pr-16 rounded-md cursor-pointer transition-colors text-sm ${
                        isActive ? "bg-primary/10 text-primary border border-primary/20" : "hover:bg-accent/50 text-foreground/80"
                      }`}>
                        <MessageSquare size={13} className="text-muted-foreground shrink-0" />
                        <span className="truncate">{chat.title}</span>
                      </div>
                    </Link>
                    {/* Edit button */}
                    <button
                      onClick={(e) => startEdit(chat, e)}
                      className="absolute right-7 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Rename"
                    >
                      <Pencil size={11} />
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={(e) => deleteChat(chat.id, e)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20 hover:text-destructive text-muted-foreground"
                      title="Delete"
                    >
                      <Trash2 size={11} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {regularChats.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-6">No chats yet. Start one!</div>
          )}
        </div>

        <div className="p-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary uppercase font-bold text-sm">
              {user?.name?.charAt(0) || "U"}
            </div>
            <span className="text-sm truncate font-semibold">{user?.name}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
            <LogOut size={16} className="text-muted-foreground" />
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col max-w-full overflow-hidden">
        <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-background z-10 shrink-0">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="mr-2 h-9 w-9">
              <Menu size={20} />
            </Button>
            <div className="font-semibold text-sm select-none">DevMind Enterprise</div>
          </div>
          {/* Navigation Links */}
          <div className="flex items-center gap-2">
            <Link href="/analizer">
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60">
                <Bot size={13} className="text-primary" /> Analizer
              </Button>
            </Link>
            <Link href="/agent">
              <Button size="sm" variant="secondary" className="h-8 gap-1.5 text-xs bg-muted/60 hover:bg-muted font-medium text-foreground">
                <Hammer size={13} className="text-primary" /> Open Environment
              </Button>
            </Link>
          </div>
        </header>
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
