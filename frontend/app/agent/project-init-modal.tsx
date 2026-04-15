"use client";

import { useState } from "react";
import { Sparkles, FolderOpen, ArrowRight, Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgent } from "./agent-context";
import { getStarterVFS, readDirectoryToVFS } from "@/lib/agent-engine";
import { fetchWithAuth } from "@/lib/api";
import { usePathname } from "next/navigation";

type Step = "choose" | "scratch_form" | "loading";

const PROJECT_TYPES = [
  { id: "next", label: "Next.js App", icon: "▲", description: "Full-stack React framework" },
  { id: "react", label: "React SPA", icon: "⚛", description: "Single page application" },
  { id: "node", label: "Node.js API", icon: "🟢", description: "Backend REST/GraphQL API" },
  { id: "html", label: "Static Site", icon: "🌐", description: "HTML/CSS/JS website" },
];

interface Props {
  onProjectCreated: (chatId: number) => void;
}

export function ProjectInitModal({ onProjectCreated }: Props) {
  const { projectMode, setProjectMode, setProjectName, setVfs, addLogEntry, setActiveFile, generateAndSaveContext } = useAgent();
  const [step, setStep] = useState<Step>("choose");
  const [nameInput, setNameInput] = useState("");
  const [selectedType, setSelectedType] = useState("next");
  const [loadingMsg, setLoadingMsg] = useState("Initializing...");
  const pathname = usePathname();

  if (projectMode !== null || pathname !== "/agent") return null;

  const handleStartFromScratch = async () => {
    if (!nameInput.trim()) return;
    setStep("loading");
    setLoadingMsg("Generating project scaffold...");
    const name = nameInput.trim();

    // Create a backend chat record for this project
    let chatId: number | null = null;
    try {
      const data = await fetchWithAuth("/chats", {
        method: "POST",
        body: JSON.stringify({ title: name }),
      });
      chatId = data.id;
    } catch {}

    const vfs = getStarterVFS(name, selectedType);
    const firstFile = Object.keys(vfs).find((k) => k.endsWith(".tsx") || k.endsWith(".ts")) ?? Object.keys(vfs)[0] ?? null;
    const initialLog: Array<{ type: "system"; text: string }> = [{ type: "system", text: `✦ "${name}" initialized (${selectedType}) — ${Object.keys(vfs).length} files` }];

    if (chatId) {
      localStorage.setItem(`devmind_agent_state_${chatId}`, JSON.stringify({
        projectName: name,
        projectMode: "scratch",
        vfs,
        activeFile: firstFile,
        agentLog: initialLog
      }));
    }

    setProjectName(name);
    setVfs(vfs);
    setActiveFile(firstFile);
    addLogEntry(initialLog[0]);
    setProjectMode("scratch");

    // Generate project context in the background after project is initialized
    console.log(`[INIT] 🚀 Scratch project "${name}" created — starting context generation...`);
    setLoadingMsg("Analyzing project structure...");
    if (chatId) {
      generateAndSaveContext(vfs, name).then((ctx) => {
        if (ctx) {
          console.log(`[INIT] ✅ Context ready for "${name}": ${ctx.purpose}`);
        }
      });
    }

    if (chatId) onProjectCreated(chatId);
  };

  const handleOpenExisting = async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: "read" });
      setStep("loading");
      setLoadingMsg(`Reading "${dirHandle.name}"...`);

      let chatId: number | null = null;
      try {
        const data = await fetchWithAuth("/chats", {
          method: "POST",
          body: JSON.stringify({ title: dirHandle.name }),
        });
        chatId = data.id;
      } catch {}

      const vfs = await readDirectoryToVFS(dirHandle);
      const fileCount = Object.keys(vfs).length;
      const firstFile = Object.keys(vfs)[0] ?? null;
      const initialLog: Array<{ type: "system"; text: string }> = [{ type: "system", text: `✦ Opened "${dirHandle.name}" — ${fileCount} files` }];

      if (chatId) {
        localStorage.setItem(`devmind_agent_state_${chatId}`, JSON.stringify({
          projectName: dirHandle.name,
          projectMode: "existing",
          vfs,
          activeFile: firstFile,
          agentLog: initialLog
        }));
      }

      setProjectName(dirHandle.name);
      setVfs(vfs);
      setActiveFile(firstFile);
      addLogEntry(initialLog[0]);
      setProjectMode("existing");

      // Generate project context — crucial for existing projects the agent has never seen
      console.log(`[INIT] 📂 Existing project "${dirHandle.name}" opened — starting context generation...`);
      setLoadingMsg("Analyzing project structure and generating context...");
      if (chatId) {
        generateAndSaveContext(vfs, dirHandle.name).then((ctx) => {
          if (ctx) {
            console.log(`[INIT] ✅ Context ready for "${dirHandle.name}": ${ctx.purpose}`);
            console.log(`[INIT] 🔧 Tech stack: [${ctx.techStack.join(", ")}]`);
            console.log(`[INIT] 📋 Key files: [${ctx.keyFiles.join(", ")}]`);
          }
        });
      }

      if (chatId) onProjectCreated(chatId);
    } catch (err: any) {
      if (err?.name !== "AbortError") alert("Could not open folder. Use Chrome or Edge.");
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 ring-1 ring-primary/20 mb-4">
            <Hammer className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">New Project</h2>
          <p className="text-sm text-muted-foreground mt-1">Choose how you want to initialize</p>
        </div>

        {step === "choose" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setStep("scratch_form")}
              className="group p-6 rounded-2xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 text-left cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">Start from Scratch</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Generate a full project structure. Files live in-browser, exportable as ZIP.
              </p>
              <div className="mt-4 flex items-center gap-1 text-xs text-primary font-medium">
                Choose template <ArrowRight className="w-3 h-3" />
              </div>
            </button>

            <button
              onClick={handleOpenExisting}
              className="group p-6 rounded-2xl border border-border bg-card hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all duration-200 text-left cursor-pointer relative"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
                <FolderOpen className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">Open Existing Project</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Grant access to a local folder. DevMind reads your code and generates context.
              </p>
              <div className="mt-4 flex items-center gap-1 text-xs text-emerald-400 font-medium">
                Browse folder <ArrowRight className="w-3 h-3" />
              </div>
              <span className="absolute top-3 right-3 text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Chrome/Edge</span>
            </button>
          </div>
        )}

        {step === "scratch_form" && (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Project Name</label>
              <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="My Awesome App" autoFocus onKeyDown={(e) => e.key === "Enter" && handleStartFromScratch()} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-3">Project Type</label>
              <div className="grid grid-cols-2 gap-2">
                {PROJECT_TYPES.map((pt) => (
                  <button key={pt.id} onClick={() => setSelectedType(pt.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      selectedType === pt.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-background/50 hover:border-border/80 text-foreground/80"
                    }`}>
                    <span className="text-xl">{pt.icon}</span>
                    <div>
                      <div className="text-sm font-medium">{pt.label}</div>
                      <div className="text-[10px] text-muted-foreground">{pt.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep("choose")} className="flex-1">Back</Button>
              <Button onClick={handleStartFromScratch} disabled={!nameInput.trim()} className="flex-1">
                <Sparkles className="w-4 h-4 mr-2" /> Initialize
              </Button>
            </div>
          </div>
        )}

        {step === "loading" && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">{loadingMsg}</p>
          </div>
        )}
      </div>
    </div>
  );
}
