"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  FolderTree, ChevronRight, ChevronDown, FileCode2, FileJson,
  Code2, MonitorPlay, Terminal, Sparkles, Download, File, Folder,
  ChevronUp, Maximize2, X, Play, Square, ExternalLink, Wifi, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgent } from "./agent-context";
import { buildFileTree, type FileTreeNode } from "@/lib/agent-engine";
import JSZip from "jszip";

function getFileIcon(name: string) {
  if (name.endsWith(".tsx") || name.endsWith(".jsx")) return <FileCode2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
  if (name.endsWith(".ts") || name.endsWith(".js")) return <FileCode2 className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
  if (name.endsWith(".json")) return <FileJson className="w-3.5 h-3.5 text-orange-400 shrink-0" />;
  return <File className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
}

function FileTreeItem({ node, depth, activeFile, onSelect }: {
  node: FileTreeNode; depth: number; activeFile: string | null; onSelect: (p: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const children = Object.values(node.children);
  const isActive = node.type === "file" && node.path === activeFile;

  if (node.type === "folder") {
    return (
      <div>
        <div
          className="flex items-center gap-1 py-1 rounded-md hover:bg-muted/50 cursor-pointer text-[12px] text-foreground/80 select-none"
          style={{ paddingLeft: `${6 + depth * 10}px` }}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
          <Folder className="w-3.5 h-3.5 text-primary/70 shrink-0" />
          <span className="truncate">{node.name}</span>
        </div>
        {open && children.map(child => (
          <FileTreeItem key={child.path} node={child} depth={depth + 1} activeFile={activeFile} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 py-1 rounded-md cursor-pointer text-[12px] transition-colors ${
        isActive ? "bg-primary/10 text-primary border border-primary/20" : "hover:bg-muted/50 text-foreground/80"
      }`}
      style={{ paddingLeft: `${6 + depth * 10}px` }}
      onClick={() => onSelect(node.path)}
    >
      {getFileIcon(node.name)}
      <span className="truncate">{node.name}</span>
    </div>
  );
}

function TerminalLine({ entry }: { entry: { timestamp: string; type: string; text: string } }) {
  const color = entry.type === "create_file" ? "text-[#7ee787]" : entry.type === "edit_file" ? "text-[#a5d6ff]"
    : entry.type === "delete_file" ? "text-[#ff7b72]" : entry.type === "user" ? "text-[#f0883e]" : "text-[#8b949e]";
  return (
    <div className="flex gap-2">
      <span className="text-[#484f58] shrink-0">{entry.timestamp}</span>
      <span className={color}>{entry.text}</span>
    </div>
  );
}

// ─── Preview Panel ────────────────────────────────────────────────────────────
//
// The VFS lives in-browser memory — there is no real shell available.
// We cannot actually run `npm run dev` inside the browser.
// This panel:
//   1. Explains the correct workflow (export → run locally)
//   2. Shows the exact commands to run in the user's real terminal
//   3. Lets the user paste their actual localhost URL and open it in a new tab

function PreviewTerminal({ projectName }: { projectName: string }) {
  const [customUrl, setCustomUrl] = useState("http://localhost:3000");
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    });
  };

  const openInBrowser = () => {
    const url = customUrl.trim() || "http://localhost:3000";
    const full = url.startsWith("http") ? url : `http://${url}`;
    window.open(full, "_blank", "noopener,noreferrer");
  };

  const steps: { cmd: string; label: string }[] = [
    { cmd: "cd ~Downloads && unzip project.zip", label: "1. Extract ZIP" },
    { cmd: "npm install", label: "2. Install deps" },
    { cmd: "npm run dev", label: "3. Start server" },
  ];

  return (
    <div className="absolute inset-0 flex flex-col bg-[#0d1117] font-mono overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#010409] border-b border-[#30363d] shrink-0">
        <MonitorPlay className="w-3.5 h-3.5 text-[#8b949e]" />
        <span className="text-[11px] text-[#8b949e] font-semibold uppercase tracking-wider">Preview</span>
        <span className="text-[10px] text-[#484f58]">{projectName}</span>
        <span className="ml-auto text-[9px] text-[#484f58] bg-[#161b22] border border-[#30363d] px-2 py-0.5 rounded">
          Browser-only · no shell access
        </span>
      </div>

      {/* Explanation notice */}
      <div className="mx-3 mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 shrink-0">
        <p className="text-[11px] text-amber-400/80 leading-relaxed">
          <span className="font-semibold text-amber-400">ℹ️ How preview works</span><br />
          DevMind files live in browser memory. To preview your project, export a ZIP, extract it, and run it in your own terminal below.
        </p>
      </div>

      {/* Step-by-step run guide */}
      <div className="px-3 pt-3 shrink-0">
        <span className="text-[9px] text-[#8b949e] uppercase tracking-wider font-semibold">Run steps</span>
        <div className="mt-1.5 space-y-1.5">
          {steps.map(({ cmd, label }) => (
            <div key={cmd} className="flex items-center justify-between gap-2 rounded-md border border-[#30363d] bg-[#161b22] px-3 py-2">
              <div className="min-w-0">
                <p className="text-[9px] text-[#484f58] uppercase tracking-wide">{label}</p>
                <p className="text-[11px] text-[#c9d1d9] font-mono truncate">{cmd}</p>
              </div>
              <button
                onClick={() => copyToClipboard(cmd, label)}
                className="shrink-0 text-[9px] text-[#8b949e] hover:text-[#c9d1d9] bg-[#21262d] hover:bg-[#30363d] px-2 py-1 rounded border border-[#30363d] transition-colors"
                title="Copy command"
              >
                {copied === label ? "✓ Copied" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2 px-3 mt-4 shrink-0">
        <div className="flex-1 h-px bg-[#30363d]" />
        <span className="text-[9px] text-[#484f58] uppercase tracking-wider">Then open in browser</span>
        <div className="flex-1 h-px bg-[#30363d]" />
      </div>

      {/* URL input + open button */}
      <div className="px-3 pt-3 pb-4 shrink-0">
        <p className="text-[9px] text-[#8b949e] uppercase tracking-wider mb-1.5">Localhost URL</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1.5 border border-[#30363d] rounded-md bg-[#161b22] px-2.5 py-1.5 focus-within:border-primary/50 transition-colors">
            <Wifi className="w-3 h-3 text-[#484f58] shrink-0" />
            <input
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") openInBrowser(); }}
              placeholder="http://localhost:3000"
              spellCheck={false}
              className="flex-1 bg-transparent text-[11px] text-[#c9d1d9] outline-none placeholder:text-[#484f58] font-mono"
            />
          </div>
          <button
            onClick={openInBrowser}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/90 hover:bg-primary text-primary-foreground text-[11px] font-medium transition-colors shrink-0"
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open
          </button>
        </div>
        <p className="text-[9px] text-[#484f58] mt-1.5">
          Enter the port your dev server is running on, then click Open ↗
        </p>
      </div>

      {/* Common ports quick pick */}
      <div className="px-3 pb-3 shrink-0">
        <p className="text-[9px] text-[#484f58] uppercase tracking-wider mb-1.5">Common ports</p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "Next.js / Vite", port: 3000 },
            { label: "Vite alt", port: 5173 },
            { label: "React CRA", port: 3001 },
            { label: "Node / Express", port: 8000 },
            { label: "Django", port: 8080 },
          ].map(({ label, port }) => (
            <button
              key={port}
              onClick={() => setCustomUrl(`http://localhost:${port}`)}
              className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
                customUrl === `http://localhost:${port}`
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] bg-[#161b22] hover:bg-[#21262d]"
              }`}
              title={label}
            >
              :{port}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


// ─── Shared Agent Log Content ─────────────────────────────────────────────────

function LogContent({ agentLog, logEndRef }: {
  agentLog: { timestamp: string; type: string; text: string }[];
  logEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="p-2.5 font-mono text-[11px] space-y-1 break-words whitespace-pre-wrap">
        {agentLog.length === 0 ? (
          <span className="text-[#484f58] italic">Waiting for agent activity...</span>
        ) : agentLog.map((e, i) => <TerminalLine key={i} entry={e} />)}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

export function AgentWorkspacePanel() {

  const { projectName, projectMode, vfs, setVfs, activeFile, setActiveFile, agentLog } = useAgent();
  const [activeTab, setActiveTab] = useState("code");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(true);
  const [logFullscreen, setLogFullscreen] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [agentLog, logOpen, logFullscreen]);

  const fileTree = useMemo(() => buildFileTree(vfs), [vfs]);
  const fileCount = Object.keys(vfs).length;
  const activeContent = editedContent !== null ? editedContent : (activeFile ? vfs[activeFile] ?? "" : "");
  const hasUnsavedChanges = editedContent !== null && editedContent !== (activeFile ? vfs[activeFile] : "");

  if (projectMode === null) return null;

  const handleFileSelect = (path: string) => {
    if (editedContent !== null && activeFile) {
      setVfs({ ...vfs, [activeFile]: editedContent });
      setEditedContent(null);
    }
    setActiveFile(path);
    setActiveTab("code");
  };

  const handleSaveFile = () => {
    if (editedContent !== null && activeFile) {
      setVfs({ ...vfs, [activeFile]: editedContent });
      setEditedContent(null);
    }
  };

  const handleExportZip = async () => {
    const zip = new JSZip();
    for (const [path, content] of Object.entries(vfs)) zip.file(path, content);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, "-").toLowerCase()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTabChange = (tab: string) => {
    if (tab === "log") return; // handled by logFullscreen state
    setActiveTab(tab);
  };

  const openLogFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLogFullscreen(true);
    setActiveTab("log");
  };

  const closeLogFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLogFullscreen(false);
    setActiveTab("code");
  };

  return (
    <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden border-b lg:border-b-0 lg:border-r border-border/40">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between px-4 py-2 border-b border-border/40 bg-card/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 bg-primary/10 rounded-md shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-[13px] truncate">{projectName}</h1>
              <p className="text-[10px] text-muted-foreground">
                {projectMode === "existing" ? "📂 Existing" : "✦ Scratch"} • {fileCount} files
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasUnsavedChanges && (
              <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px] border-orange-500/40 text-orange-400 hover:bg-orange-500/10" onClick={handleSaveFile}>
                Save ●
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px] text-muted-foreground" onClick={handleExportZip} disabled={fileCount === 0}>
              <Download className="w-3 h-3" /> ZIP
            </Button>
          </div>
        </header>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* File Explorer */}
          <aside className={`${sidebarOpen ? "w-52" : "w-0 lg:w-9"} hidden md:flex flex-shrink-0 flex-col border-r border-border/40 bg-card/20 transition-all duration-300 overflow-hidden`}>
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/40">
              {sidebarOpen && <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1"><FolderTree className="w-3 h-3" /> Files</span>}
              <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground ml-auto" onClick={() => setSidebarOpen(!sidebarOpen)}>
                <ChevronRight className={`w-3 h-3 transition-transform ${sidebarOpen ? "rotate-180" : ""}`} />
              </Button>
            </div>
            {sidebarOpen && (
              <div className="flex-1 overflow-y-auto">
                <div className="p-1 space-y-0.5">
                  {fileTree.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground text-center py-6 px-2">Ask the agent to create files!</div>
                  ) : (
                    fileTree.map(node => <FileTreeItem key={node.path} node={node} depth={0} activeFile={activeFile} onSelect={handleFileSelect} />)
                  )}
                </div>
              </div>
            )}
          </aside>

          {/* Editor + Terminal */}
          <div className="flex-1 flex flex-col min-w-0">
            <Tabs value={logFullscreen ? "log" : activeTab} onValueChange={handleTabChange} className="flex flex-col flex-1 min-h-0">
              {/* Tab bar */}
              <div className="flex items-center px-3 bg-muted/10 border-b border-border/40 shrink-0">
                <TabsList className="bg-transparent border-0 h-9 w-auto rounded-none p-0 gap-3">
                  <TabsTrigger
                    value="code"
                    onClick={() => { setLogFullscreen(false); setActiveTab("code"); }}
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1.5 h-full text-[11px] font-medium uppercase text-muted-foreground data-[state=active]:text-foreground"
                  >
                    <Code2 className="w-3.5 h-3.5 mr-1.5" /> Code
                  </TabsTrigger>
                  <TabsTrigger
                    value="preview"
                    onClick={() => { setLogFullscreen(false); setActiveTab("preview"); }}
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1.5 h-full text-[11px] font-medium uppercase text-muted-foreground data-[state=active]:text-foreground"
                  >
                    <MonitorPlay className="w-3.5 h-3.5 mr-1.5" /> Preview
                  </TabsTrigger>

                  {/* Log tab — only shown when fullscreen */}
                  {logFullscreen && (
                    <TabsTrigger
                      value="log"
                      className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#8b949e] rounded-none px-1.5 h-full text-[11px] font-medium uppercase text-[#8b949e] data-[state=active]:text-[#c9d1d9] flex items-center gap-1.5"
                    >
                      <Terminal className="w-3.5 h-3.5" /> Log
                      <div
                        role="button"
                        onClick={closeLogFullscreen}
                        className="ml-1 rounded-sm hover:bg-white/10 p-0.5 transition-colors cursor-pointer flex items-center justify-center pointer-events-auto"
                        title="Close fullscreen log"
                      >
                        <X className="w-3 h-3" />
                      </div>
                    </TabsTrigger>
                  )}
                </TabsList>
                {!logFullscreen && activeFile && (
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                    {activeFile}{hasUnsavedChanges ? " ●" : ""}
                  </span>
                )}
              </div>

              <div className="flex-1 relative min-h-0">
                <TabsContent value="code" className="absolute inset-0 m-0 border-0 flex flex-col bg-[#0d1117]">
                  {activeFile ? (
                    <textarea
                      value={activeContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      spellCheck={false}
                      className="flex-1 w-full h-full bg-transparent text-[#c9d1d9] font-mono text-[12px] leading-relaxed p-4 resize-none focus:outline-none"
                      style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace" }}
                    />
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center opacity-20 space-y-2">
                        <FileCode2 className="w-10 h-10 mx-auto" />
                        <p className="text-xs text-muted-foreground">Select a file</p>
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="preview" className="absolute inset-0 m-0 border-0">
                  <PreviewTerminal projectName={projectName} />
                </TabsContent>

                {/* Log fullscreen tab content */}
                {logFullscreen && (
                  <TabsContent value="log" className="absolute inset-0 m-0 border-0 flex flex-col bg-[#0d1117]">
                    <LogContent agentLog={agentLog} logEndRef={logEndRef} />
                  </TabsContent>
                )}
              </div>
            </Tabs>

            {/* Terminal / Agent Log — collapsible bottom bar (hidden when fullscreen) */}
            {!logFullscreen && (
              <div className={`shrink-0 border-t border-border/40 bg-[#0d1117] flex flex-col transition-all duration-300 ${logOpen ? "h-44" : "h-8"}`}>
                <div
                  className="px-3 border-b border-[#30363d] bg-[#010409] shrink-0 flex items-center justify-between cursor-pointer select-none h-8"
                  onClick={() => setLogOpen((v) => !v)}
                >
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-[#8b949e] flex items-center gap-1.5">
                    <Terminal className="w-3 h-3" /> Agent Log
                    <span className="text-[#484f58] normal-case tracking-normal font-normal">{agentLog.length} entries</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={openLogFullscreen}
                      className="p-0.5 rounded hover:bg-white/10 transition-colors"
                      title="Open log in fullscreen tab"
                    >
                      <Maximize2 className="w-3 h-3 text-[#484f58] hover:text-[#8b949e]" />
                    </button>
                    <ChevronUp className={`w-3.5 h-3.5 text-[#484f58] transition-transform duration-300 ${logOpen ? "" : "rotate-180"}`} />
                  </div>
                </div>
                {logOpen && <LogContent agentLog={agentLog} logEndRef={logEndRef} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
