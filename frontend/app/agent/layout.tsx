"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Bot, Plus, LogOut, Menu, PanelLeftClose, Trash2, Sparkles, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { AgentProvider, useAgent } from "./agent-context";
import { AgentWorkspacePanel } from "./workspace-panel";
import { ProjectInitModal } from "./project-init-modal";

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AgentProvider>
      <AgentLayoutInner>{children}</AgentLayoutInner>
    </AgentProvider>
  );
}

// Project Chat IDs persisted in localStorage
const PROJECT_IDS_KEY = "devmind_project_chat_ids";

function getProjectIds(): Set<number> {
  try {
    const stored = localStorage.getItem(PROJECT_IDS_KEY);
    return stored ? new Set(JSON.parse(stored) as number[]) : new Set();
  } catch { return new Set(); }
}
function addProjectId(id: number) {
  const ids = getProjectIds();
  ids.add(id);
  localStorage.setItem(PROJECT_IDS_KEY, JSON.stringify([...ids]));
}
function removeProjectId(id: number) {
  const ids = getProjectIds();
  ids.delete(id);
  localStorage.setItem(PROJECT_IDS_KEY, JSON.stringify([...ids]));
}

function AgentLayoutInner({ children }: { children: React.ReactNode }) {
  const [allChats, setAllChats] = useState<any[]>([]);
  const [projectIds, setProjectIds] = useState<Set<number>>(new Set());
  const [user, setUser] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { projectMode } = useAgent();

  const currentChatIdFromUrl = pathname?.match(/\/agent\/chat\/(\d+)/)?.[1];

  const loadChats = useCallback(() => {
    fetchWithAuth("/chats")
      .then((data) => setAllChats(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (!token || !storedUser) { router.push("/login"); return; }
    setUser(JSON.parse(storedUser));

    const ids = getProjectIds();
    setProjectIds(ids);

    loadChats();

    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [router, loadChats]);

  useEffect(() => {
    window.addEventListener("devmind-chats-refresh", loadChats);
    return () => window.removeEventListener("devmind-chats-refresh", loadChats);
  }, [loadChats]);

  // Only show project chats
  const projectChats = allChats.filter((c) => projectIds.has(c.id));

  const createNewProject = () => {
    router.push("/agent");
  };

  const deleteProject = async (chatId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetchWithAuth(`/chats/${chatId}`, { method: "DELETE" });
      removeProjectId(chatId);
      setProjectIds(getProjectIds());
      setAllChats((prev) => prev.filter((c) => c.id !== chatId));
      if (String(chatId) === currentChatIdFromUrl) router.push("/agent");
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
    if (editingId !== chatId) return;
    const trimmed = editVal.trim();
    setEditingId(null);
    if (!trimmed) return;
    
    setAllChats((prev) => prev.map((c) => c.id === chatId ? { ...c, title: trimmed } : c));
    try {
      await fetchWithAuth(`/chats/${chatId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: trimmed }),
      });
      window.dispatchEvent(new CustomEvent("devmind-chats-refresh"));
    } catch {}
  };

  const cancelEdit = () => setEditingId(null);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  return (
    <div className="dark flex h-screen overflow-hidden bg-background font-mono text-foreground">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── PROJECT SIDEBAR ── */}
      <aside
        className={`absolute md:relative z-30 h-full flex flex-col transition-all duration-300 ease-in-out bg-card/95 backdrop-blur-xl md:bg-card/50 overflow-hidden shrink-0
          ${sidebarOpen
            ? "w-64 translate-x-0 border-r border-border shadow-2xl md:shadow-none"
            : "w-64 -translate-x-full md:w-0 md:translate-x-0 md:border-r-0"}`}
      >
        <div className="flex items-center justify-between p-4 pb-2">
          <div className="flex items-center gap-2">
            <Bot size={13} className="text-primary" />
            <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Projects</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setSidebarOpen(false)}>
            <PanelLeftClose size={16} />
          </Button>
        </div>

        <div className="px-4 pb-3">
          <Button
            onClick={createNewProject}
            disabled={creating}
            variant="outline"
            className="w-full justify-start gap-2 border-primary/30 text-primary hover:text-primary hover:bg-primary/10 text-sm h-9"
          >
            {creating ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> Creating...
              </span>
            ) : (
              <><Plus size={14} /> New Project</>
            )}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          {projectChats.length === 0 && (
            <div className="text-[11px] text-muted-foreground text-center py-8 leading-relaxed px-2">
              No projects yet.<br />Click "New Project" to start.
            </div>
          )}
          {projectChats.map((chat) => {
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
                    <Link href={`/agent/chat/${chat.id}`}>
                      <div className={`flex items-center gap-2 p-2 pr-16 rounded-md cursor-pointer transition-colors text-sm ${
                        isActive ? "bg-primary/10 text-primary border border-primary/20" : "hover:bg-accent/50 text-foreground/80"
                      }`}>
                        <Bot size={13} className={isActive ? "text-primary shrink-0" : "text-primary/50 shrink-0"} />
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
                      onClick={(e) => deleteProject(chat.id, e)}
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
        </div>

        <div className="p-4 border-t border-border flex items-center justify-between mt-auto">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary uppercase font-bold text-xs">
              {user?.name?.charAt(0) || "U"}
            </div>
            <span className="text-sm truncate font-semibold">{user?.name}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
            <LogOut size={15} className="text-muted-foreground" />
          </Button>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Navbar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-background z-10 shrink-0">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="mr-2 h-9 w-9">
              <Menu size={20} />
            </Button>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />
              <span className="font-semibold text-sm select-none">DevMind Agent</span>
            </div>
          </div>
          <Link href="/chat">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5">
              ← Back to Chat
            </Button>
          </Link>
        </header>

        {/* Content: Workspace (left) + Chat pane (right) */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden relative">
          {/* Project Init Modal — shown when no project is loaded */}
          <ProjectInitModal onProjectCreated={(chatId: number) => {
            addProjectId(chatId);
            setProjectIds(getProjectIds());
            fetchWithAuth("/chats").then(setAllChats).catch(() => {});
            router.push(`/agent/chat/${chatId}`);
          }} />

          {/* Workspace Panel */}
          <AgentWorkspacePanel />

          {/* Chat Pane */}
          <div className="w-full lg:w-80 h-1/2 lg:h-full shrink-0 border-t lg:border-t-0 lg:border-l border-border/40 bg-card/10 flex flex-col overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
