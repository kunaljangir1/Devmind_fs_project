"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Terminal, 
  Play, 
  Save, 
  FolderTree, 
  FileCode2, 
  FileJson, 
  Send,
  Wand2,
  Settings,
  ChevronRight,
  ChevronDown,
  MonitorPlay,
  Code2,
  Sparkles,
  Bot
} from "lucide-react";

export default function BuilderPage() {
  const [activeTab, setActiveTab] = useState("code");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "ai", content: "Hi! I'm DevMind. What do you want to build today? We can create a Next.js app, a Python API, or anything else." }
  ]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    setMessages([...messages, { role: "user", content: chatInput }]);
    setChatInput("");
    
    // Mock AI response
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: "ai", 
        content: "I'll start building that right away. Let me set up the initial file structure..." 
      }]);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background font-sans selection:bg-primary/30">
      
      {/* ── HEADER ── */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-card/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-primary/10 rounded-md">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-sm leading-tight text-foreground">Next.js Dashboard Project</h1>
            <p className="text-xs text-muted-foreground">Draft • Agent Workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Save className="w-3.5 h-3.5" /> Save
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-emerald-900/20">
            <Play className="w-3.5 h-3.5" /> Start Dev Server
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 ml-1 text-muted-foreground hover:text-foreground">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* ── MAIN WORKSPACE ── */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* ── LEFT PANEL (FILE EXPLORER) ── */}
        <aside className={`${isSidebarOpen ? 'w-64' : 'w-12'} flex flex-col border-r border-border/40 bg-card/30 transition-all duration-300`}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
            {isSidebarOpen && <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1"><FolderTree className="w-3.5 h-3.5" /> Files</span>}
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              <ChevronRight className={`w-4 h-4 transition-transform ${isSidebarOpen ? 'rotate-180' : ''}`} />
            </Button>
          </div>
          {isSidebarOpen && (
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5">
                {/* Mock File Tree */}
                <div className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm text-foreground/80">
                  <ChevronDown className="w-3.5 h-3.5" />
                  <FolderTree className="w-4 h-4 text-primary/70" />
                  <span>app</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-primary/10 text-primary cursor-pointer text-sm ml-4">
                  <FileCode2 className="w-4 h-4 text-emerald-400" />
                  <span>page.tsx</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm mb-2 ml-4 text-foreground/80">
                  <FileCode2 className="w-4 h-4 text-blue-400" />
                  <span>layout.tsx</span>
                </div>
                
                <div className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm text-foreground/80">
                  <ChevronRight className="w-3.5 h-3.5" />
                  <FolderTree className="w-4 h-4 text-primary/70" />
                  <span>components</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm text-foreground/80">
                  <FileJson className="w-4 h-4 text-yellow-400" />
                  <span>package.json</span>
                </div>
              </div>
            </ScrollArea>
          )}
        </aside>

        {/* ── CENTER PANEL (EDITOR & TERMINAL) ── */}
        <main className="flex-1 flex flex-col min-w-0 bg-background/50">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 h-full">
            <div className="flex items-center px-4 bg-muted/20 border-b border-border/40">
              <TabsList className="bg-transparent border-0 h-10 w-full justify-start rounded-none p-0 gap-4">
                <TabsTrigger 
                  value="code" 
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 h-full text-xs font-medium uppercase tracking-wider text-muted-foreground data-[state=active]:text-foreground"
                >
                  <Code2 className="w-4 h-4 mr-2" /> Code
                </TabsTrigger>
                <TabsTrigger 
                  value="preview" 
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 h-full text-xs font-medium uppercase tracking-wider text-muted-foreground data-[state=active]:text-foreground"
                >
                  <MonitorPlay className="w-4 h-4 mr-2" /> Preview
                </TabsTrigger>
              </TabsList>
            </div>
            
            <div className="flex-1 relative">
              <TabsContent value="code" className="absolute inset-0 m-0 border-0 overflow-auto bg-[#0d1117]">
                {/* Mock Code Editor using a simple pre block with styling */}
                <pre className="p-6 text-sm font-mono leading-relaxed text-[#c9d1d9] overflow-x-auto min-h-full">
            <code>
<span className="text-[#ff7b72]">export default function</span> <span className="text-[#d2a8ff]">Dashboard</span>() {"{"}
{"\n"}  <span className="text-[#ff7b72]">return</span> (
{"\n"}    <span className="text-[#8b949e]">{"<"}</span><span className="text-[#7ee787]">div</span> <span className="text-[#79c0ff]">className</span>=<span className="text-[#a5d6ff]">"flex h-screen bg-neutral-950 text-white"</span><span className="text-[#8b949e]">{">"}</span>
{"\n"}      <span className="text-[#8b949e]">{"<"}</span><span className="text-[#7ee787]">Sidebar</span> <span className="text-[#8b949e]">{"/>"}</span>
{"\n"}      <span className="text-[#8b949e]">{"<"}</span><span className="text-[#7ee787]">main</span> <span className="text-[#79c0ff]">className</span>=<span className="text-[#a5d6ff]">"flex-1 p-8"</span><span className="text-[#8b949e]">{">"}</span>
{"\n"}        <span className="text-[#8b949e]">{"<"}</span><span className="text-[#7ee787]">h1</span> <span className="text-[#79c0ff]">className</span>=<span className="text-[#a5d6ff]">"text-3xl font-bold tracking-tight"</span><span className="text-[#8b949e]">{">"}</span>Overview<span className="text-[#8b949e]">{"</"}</span><span className="text-[#7ee787]">h1</span><span className="text-[#8b949e]">{">"}</span>
{"\n"}        <span className="text-[#8b949e]">{"<"}</span><span className="text-[#7ee787]">MetricsGrid</span> <span className="text-[#8b949e]">{"/>"}</span>
{"\n"}      <span className="text-[#8b949e]">{"</"}</span><span className="text-[#7ee787]">main</span><span className="text-[#8b949e]">{">"}</span>
{"\n"}    <span className="text-[#8b949e]">{"</"}</span><span className="text-[#7ee787]">div</span><span className="text-[#8b949e]">{">"}</span>
{"\n"}  );
{"\n"}{"}"}
            </code>
                </pre>
              </TabsContent>
              <TabsContent value="preview" className="absolute inset-0 m-0 border-0 flex items-center justify-center bg-muted/10 p-4">
                <div className="w-full h-full bg-background border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden">
                  <div className="h-10 border-b border-border bg-muted/30 flex items-center px-4 gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                    <div className="mx-auto px-4 py-1 rounded bg-background border border-border text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                      <LockIcon className="w-3 h-3" /> localhost:3000
                    </div>
                  </div>
                  <div className="flex-1 p-8 bg-neutral-950 text-white flex">
                    {/* Mock Dashboard inside preview */}
                    <div className="w-48 border-r border-neutral-800 p-4 opacity-50">Sidebar</div>
                    <div className="flex-1 p-8 space-y-6">
                      <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="h-24 bg-neutral-900 rounded-xl border border-neutral-800"></div>
                        <div className="h-24 bg-neutral-900 rounded-xl border border-neutral-800"></div>
                        <div className="h-24 bg-neutral-900 rounded-xl border border-neutral-800"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          {/* ── TERMINAL PANEL ── */}
          <div className="h-48 border-t border-border/40 bg-[#0d1117] flex flex-col">
             <div className="flex items-center px-3 py-1.5 border-b border-[#30363d] bg-[#010409]">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#8b949e] flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5" /> Output</span>
             </div>
             <ScrollArea className="flex-1 p-3">
               <div className="font-mono text-xs space-y-1.5 opacity-90">
                 <div className="text-[#7ee787]">➜  frontend git:(main) npm run dev</div>
                 <div className="text-[#8b949e]">&gt; devmind-frontend@0.1.0 dev</div>
                 <div className="text-[#8b949e]">&gt; next dev</div>
                 <div className="text-[#a5d6ff]">▲ Next.js 14.1.0</div>
                 <div className="text-[#8b949e]">- Local:        http://localhost:3000</div>
                 <div className="text-[#7ee787]">✓ Ready in 1250ms</div>
                 <div className="text-foreground">Compiling /builder/page...</div>
                 <div className="text-[#7ee787]">✓ Compiled /builder/page in 345ms (622 modules)</div>
               </div>
             </ScrollArea>
          </div>
        </main>

        {/* ── RIGHT PANEL (AGENT CHAT) ── */}
        <aside className="w-80 flex flex-col border-l border-border/40 bg-card/30">
          <div className="flex items-center px-4 py-3 border-b border-border/40 bg-gradient-to-r from-primary/10 to-transparent">
             <Bot className="w-5 h-5 text-primary mr-2" />
             <span className="text-sm font-semibold text-primary">DevMind Build Agent</span>
          </div>
          
          <ScrollArea className="flex-1 p-4 pb-0">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} gap-1.5`}>
                  <div className={`p-3 rounded-xl text-sm leading-relaxed max-w-[90%] shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                      : 'bg-background border border-border rounded-tl-sm'
                  }`}>
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase opacity-70 tracking-widest px-1">
                    {msg.role === 'user' ? 'You' : 'DevMind'}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="p-4 pt-2">
             <form onSubmit={handleSendMessage} className="relative flex items-end bg-background border border-border shadow-sm rounded-xl overflow-hidden focus-within:ring-1 focus-within:ring-primary/50 transition-shadow">
                <textarea 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask DevMind to build..."
                  className="flex-1 bg-transparent border-0 resize-none min-h-[60px] max-h-32 text-sm p-3 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                />
                <div className="p-2">
                  <Button 
                    type="submit" 
                    size="icon" 
                    disabled={!chatInput.trim()}
                    className="w-8 h-8 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all duration-200"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
             </form>
             <div className="flex gap-2 mt-3 overflow-x-auto pb-1 no-scrollbar">
               <span className="whitespace-nowrap px-2.5 py-1 rounded-full border border-border bg-muted/40 text-[10px] text-muted-foreground cursor-pointer hover:bg-muted/80 transition-colors">Add authentication</span>
               <span className="whitespace-nowrap px-2.5 py-1 rounded-full border border-border bg-muted/40 text-[10px] text-muted-foreground cursor-pointer hover:bg-muted/80 transition-colors">Make it mobile responsive</span>
             </div>
          </div>
        </aside>

      </div>
    </div>
  );
}

// Simple helper icon for the mock preview URL bar
function LockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
