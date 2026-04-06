"use client";

import { useState, useMemo } from "react";
import {
  FolderTree, ChevronRight, ChevronDown, FileCode2, FileJson,
  Code2, MonitorPlay, Terminal, Sparkles, Download, File, Folder,
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

export function AgentWorkspacePanel() {
  const { projectName, projectMode, vfs, setVfs, activeFile, setActiveFile, agentLog } = useAgent();
  const [activeTab, setActiveTab] = useState("code");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editedContent, setEditedContent] = useState<string | null>(null);

  const fileTree = useMemo(() => buildFileTree(vfs), [vfs]);
  const fileCount = Object.keys(vfs).length;
  const activeContent = editedContent !== null ? editedContent : (activeFile ? vfs[activeFile] ?? "" : "");
  const hasUnsavedChanges = editedContent !== null && editedContent !== (activeFile ? vfs[activeFile] : "");

  // Don't show until project is initialized
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

  return (
    <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
      {/* Workspace area takes full remaining space minus chat pane (handled by parent) */}
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
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center px-3 bg-muted/10 border-b border-border/40 shrink-0">
                <TabsList className="bg-transparent border-0 h-9 w-auto rounded-none p-0 gap-3">
                  <TabsTrigger value="code" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1.5 h-full text-[11px] font-medium uppercase text-muted-foreground data-[state=active]:text-foreground">
                    <Code2 className="w-3.5 h-3.5 mr-1.5" /> Code
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1.5 h-full text-[11px] font-medium uppercase text-muted-foreground data-[state=active]:text-foreground">
                    <MonitorPlay className="w-3.5 h-3.5 mr-1.5" /> Preview
                  </TabsTrigger>
                </TabsList>
                {activeFile && (
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
                <TabsContent value="preview" className="absolute inset-0 m-0 border-0 flex items-center justify-center bg-neutral-950 text-muted-foreground">
                  <div className="text-center opacity-30 space-y-2">
                    <MonitorPlay className="w-10 h-10 mx-auto" />
                    <p className="text-xs">Export ZIP and run locally</p>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            {/* Terminal */}
            <div className="h-40 shrink-0 border-t border-border/40 bg-[#0d1117] flex flex-col">
              <div className="px-3 py-1 border-b border-[#30363d] bg-[#010409] shrink-0">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#8b949e] flex items-center gap-1.5">
                  <Terminal className="w-3 h-3" /> Agent Log
                </span>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2.5 font-mono text-[11px] space-y-1">
                  {agentLog.length === 0 ? (
                    <span className="text-[#484f58] italic">Waiting for agent activity...</span>
                  ) : agentLog.map((e, i) => <TerminalLine key={i} entry={e} />)}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
