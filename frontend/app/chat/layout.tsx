"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { MessageSquare, Plus, LogOut, Menu } from "lucide-react";
import { toast } from "sonner";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (!token || !storedUser) {
      router.push("/login");
      return;
    }
    setUser(JSON.parse(storedUser));
    
    fetchWithAuth("/chats")
      .then((data) => setChats(data))
      .catch((err) => toast.error("Error loading history: " + err.message));
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const createNewChat = async () => {
    try {
      const data = await fetchWithAuth("/chats", {
        method: "POST",
        body: JSON.stringify({ title: "New Chat Session" }),
      });
      setChats([data, ...chats]);
      router.push(`/chat/${data.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create chat");
    }
  };

  return (
    <div className="dark flex h-screen overflow-hidden bg-background font-mono text-foreground">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full hidden"
        } w-64 flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out border-r border-border bg-card/50`}
      >
        <div className="p-4">
          <Button
            onClick={createNewChat}
            variant="outline"
            className="w-full justify-start gap-2 border-border/50 text-muted-foreground hover:text-foreground"
          >
            <Plus size={16} /> New Chat
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pt-0 space-y-2">
          {chats.map((chat) => (
            <Link key={chat.id} href={`/chat/${chat.id}`}>
              <div className="flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 cursor-pointer transition-colors">
                <MessageSquare size={16} className="text-muted-foreground" />
                <span className="text-sm truncate">{chat.title}</span>
              </div>
            </Link>
          ))}
          {chats.length === 0 && (
             <div className="text-sm text-muted-foreground p-2 text-center mt-4">
               No chats yet. Start one!
             </div>
          )}
        </div>

        <div className="p-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary uppercase font-bold text-sm">
              {user?.name?.charAt(0) || "U"}
            </div>
            <span className="text-sm truncate block font-semibold">{user?.name}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
            <LogOut size={16} className="text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-full overflow-hidden">
        <header className="h-14 border-b border-border flex items-center px-4 bg-background z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden"
          >
            <Menu size={20} />
          </Button>
          <div className="ml-4 font-semibold text-sm select-none">DevMind Enterprise</div>
        </header>
        <div className="flex-1 overflow-hidden relative">
          {children}
        </div>
      </main>
    </div>
  );
}
