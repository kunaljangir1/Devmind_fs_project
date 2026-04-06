"use client";

import { useState } from "react";
import { Sparkles, FolderOpen, Hammer, ArrowRight, Code2, Globe, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBuilder } from "./builder-context";
import { getStarterVFS, readDirectoryToVFS } from "@/lib/agent-engine";

type Step = "choose" | "scratch_form" | "loading";

const PROJECT_TYPES = [
  { id: "next", label: "Next.js App", icon: "▲", description: "Full-stack React framework" },
  { id: "react", label: "React SPA", icon: "⚛", description: "Single page application" },
  { id: "node", label: "Node.js API", icon: "🟢", description: "Backend REST/GraphQL API" },
  { id: "html", label: "Static Site", icon: "🌐", description: "HTML/CSS/JS website" },
];

export function ProjectInitModal() {
  const { projectMode, setProjectMode, setProjectName, setVfs, addLogEntry, setActiveFile, projectName } = useBuilder();
  const [step, setStep] = useState<Step>("choose");
  const [nameInput, setNameInput] = useState("");
  const [selectedType, setSelectedType] = useState("next");
  const [loadingMsg, setLoadingMsg] = useState("Initializing...");

  // Don't render if already initialized
  if (projectMode !== null) return null;

  const handleStartFromScratch = async () => {
    if (!nameInput.trim()) return;
    setStep("loading");
    setLoadingMsg("Generating project scaffold...");
    const name = nameInput.trim();
    const vfs = getStarterVFS(name, selectedType);
    setProjectName(name);
    setVfs(vfs);
    // Set first file as active
    const firstFile = Object.keys(vfs).find((k) => k.endsWith(".tsx") || k.endsWith(".ts")) ?? Object.keys(vfs)[0];
    if (firstFile) setActiveFile(firstFile);
    addLogEntry({ type: "system", text: `✦ Project "${name}" initialized from scratch (${selectedType})` });
    addLogEntry({ type: "system", text: `✦ Created ${Object.keys(vfs).length} starter files` });
    setProjectMode("scratch");
  };

  const handleOpenExisting = async () => {
    try {
      // @ts-ignore — File System Access API
      const dirHandle = await window.showDirectoryPicker({ mode: "read" });
      setStep("loading");
      setLoadingMsg(`Reading "${dirHandle.name}"...`);
      const vfs = await readDirectoryToVFS(dirHandle);
      const fileCount = Object.keys(vfs).length;
      setProjectName(dirHandle.name);
      setVfs(vfs);
      const firstFile = Object.keys(vfs)[0];
      if (firstFile) setActiveFile(firstFile);
      addLogEntry({ type: "system", text: `✦ Opened existing project: "${dirHandle.name}"` });
      addLogEntry({ type: "system", text: `✦ Read ${fileCount} files from disk` });
      setProjectMode("existing");
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        alert("Could not open folder. Make sure you're using Chrome or Edge.");
      }
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 ring-1 ring-primary/20 mb-4">
            <Hammer className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Initialize Project</h2>
          <p className="text-sm text-muted-foreground mt-1">Choose how you want to start building</p>
        </div>

        {/* ── CHOOSE STEP ── */}
        {step === "choose" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Start from scratch */}
            <button
              onClick={() => setStep("scratch_form")}
              className="group relative p-6 rounded-2xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 text-left cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-base mb-1">Start from Scratch</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Let DevMind generate a complete project structure. Files live in your browser and can be exported as ZIP.
              </p>
              <div className="mt-4 flex items-center gap-1 text-xs text-primary font-medium">
                Choose template <ArrowRight className="w-3 h-3" />
              </div>
            </button>

            {/* Open existing */}
            <button
              onClick={handleOpenExisting}
              className="group relative p-6 rounded-2xl border border-border bg-card hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all duration-200 text-left cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-colors">
                <FolderOpen className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-foreground text-base mb-1">Open Existing Project</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Grant access to a local folder. DevMind reads your files and generates full context to assist you.
              </p>
              <div className="mt-4 flex items-center gap-1 text-xs text-emerald-400 font-medium">
                Browse folder <ArrowRight className="w-3 h-3" />
              </div>
              <div className="absolute top-3 right-3 text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Chrome/Edge</div>
            </button>
          </div>
        )}

        {/* ── SCRATCH FORM ── */}
        {step === "scratch_form" && (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Project Name</label>
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="My Awesome App"
                className="text-base"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleStartFromScratch()}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-3">Project Type</label>
              <div className="grid grid-cols-2 gap-2">
                {PROJECT_TYPES.map((pt) => (
                  <button
                    key={pt.id}
                    onClick={() => setSelectedType(pt.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      selectedType === pt.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background/50 hover:border-border/80 text-foreground/80"
                    }`}
                  >
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
              <Button
                onClick={handleStartFromScratch}
                disabled={!nameInput.trim()}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Sparkles className="w-4 h-4 mr-2" /> Initialize Project
              </Button>
            </div>
          </div>
        )}

        {/* ── LOADING ── */}
        {step === "loading" && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">{loadingMsg}</p>
          </div>
        )}
      </div>
    </div>
  );
}
