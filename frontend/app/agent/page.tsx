"use client";

import Link from "next/link";
import { Bot, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AgentIndexPage() {
  return (
    <div className="flex flex-col h-full w-full items-center justify-center gap-6 p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
        <Bot className="w-8 h-8 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-foreground">DevMind Build Agent</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Select a project from the sidebar or create a new one to start building.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ArrowRight className="w-3.5 h-3.5" />
        Click a project on the left, or "New Project"
      </div>
    </div>
  );
}
