"use client";

/**
 * app/agents/page.tsx — Multi-Agent Code Analyzer
 *
 * Displays a code input area and 4 agent result cards in a 2×2 grid.
 * Agents can run via SSE streaming (for Anthropic backend) or via
 * JSON response (for Raiden API backend). The page handles both.
 *
 * Features:
 * - Code input with character count and validation
 * - Per-agent status badges (Pending → Running → Complete → Failed)
 * - Skeleton loading states
 * - Agent results in Tabs (Complexity | Security | Refactor | Docs)
 * - Security findings in a Table with severity badges
 * - Copy-to-clipboard with toast confirmation
 * - Export all results dialog
 */

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import {
    Brain,
    ArrowLeft,
    Loader2,
    AlertCircle,
    Copy,
    Trash2,
    FileDown,
    ClipboardPaste,
    Zap,
    Shield,
    Wrench,
    FileText,
    Clock,
    CheckCircle2,
    XCircle,
    History,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SeverityBadge } from "@/components/severity-badge";
import { ModeToggle } from "@/components/mode-toggle";
import { toast } from "sonner";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

// ─── Types ──────────────────────────────────────────────────────

type AgentId = "complexity" | "security" | "refactor" | "docs";
type AgentStatus = "idle" | "pending" | "running" | "complete" | "failed";

interface AgentResult {
    id: AgentId;
    name: string;
    emoji: string;
    status: AgentStatus;
    result: string;
    durationMs: number;
    modelUsed?: string;
    error?: string;
}

/** Agent metadata for display */
const AGENT_META: Record<AgentId, { name: string; emoji: string; icon: typeof Zap; color: string }> = {
    complexity: { name: "Complexity Analyst", emoji: "📊", icon: Zap, color: "text-yellow-500" },
    security: { name: "Security Auditor", emoji: "🔐", icon: Shield, color: "text-red-500" },
    refactor: { name: "Refactor Advisor", emoji: "✨", icon: Wrench, color: "text-blue-500" },
    docs: { name: "Doc Generator", emoji: "📝", icon: FileText, color: "text-green-500" },
};

export interface HistoryRecord {
    id: string;
    date: string;
    codeSnippet: string;
    code: string;
    agents: AgentResult[];
    totalDuration: number | null;
}

const MAX_CODE_LENGTH = 4000;

export default function AgentsPage() {
    // ─── State ────────────────────────────────────────────────────
    const [code, setCode] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [agents, setAgents] = useState<AgentResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [dsaError, setDsaError] = useState<string | null>(null);
    const [totalDuration, setTotalDuration] = useState<number | null>(null);
    const [progress, setProgress] = useState(0);
    const [history, setHistory] = useState<HistoryRecord[]>([]);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Load persisted state on mount
    useEffect(() => {
        try {
            const savedCode = localStorage.getItem("analyzer_code_state");
            if (savedCode) setCode(savedCode);

            const savedAgents = localStorage.getItem("analyzer_agents_state");
            if (savedAgents) setAgents(JSON.parse(savedAgents));

            const savedDuration = localStorage.getItem("analyzer_duration_state");
            if (savedDuration) setTotalDuration(Number(savedDuration));

            const savedHistory = localStorage.getItem("analyzer_history");
            if (savedHistory) setHistory(JSON.parse(savedHistory));
        } catch (e) {
            console.error("Failed to recover analyzer state from localStorage", e);
        }
    }, []);

    // Sync active code to localStorage
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            localStorage.setItem("analyzer_code_state", code);
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [code]);

    // Sync agents and duration to localStorage and History on completion
    useEffect(() => {
        if (!isAnalyzing && agents.length > 0) {
            localStorage.setItem("analyzer_agents_state", JSON.stringify(agents));
            
            if (totalDuration !== null) {
                localStorage.setItem("analyzer_duration_state", String(totalDuration));
                
                // Add to history
                const allFinished = agents.every(a => a.status === 'complete' || a.status === 'failed');
                if (allFinished) {
                    setHistory(prev => {
                        const latest = prev[0];
                        if (latest && latest.totalDuration === totalDuration && latest.code === code) return prev;
                        
                        const newRecord: HistoryRecord = {
                            id: Date.now().toString(),
                            date: new Date().toLocaleString(),
                            codeSnippet: code.slice(0, 100) + (code.length > 100 ? '...' : ''),
                            code,
                            agents,
                            totalDuration
                        };
                        const updated = [newRecord, ...prev].slice(0, 20); // Keep last 20 records
                        localStorage.setItem("analyzer_history", JSON.stringify(updated));
                        return updated;
                    });
                }
            }
        }
    }, [isAnalyzing, agents, totalDuration, code]);

    /** Status badge variant based on agent status */
    const getStatusBadge = (status: AgentStatus) => {
        switch (status) {
            case "idle":
            case "pending":
                return <Badge variant="outline" className="transition-colors">Pending</Badge>;
            case "running":
                return <Badge className="bg-blue-500 text-white transition-colors"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Running</Badge>;
            case "complete":
                return <Badge className="bg-green-600 text-white transition-colors"><CheckCircle2 className="mr-1 h-3 w-3" />Complete</Badge>;
            case "failed":
                return <Badge variant="destructive" className="transition-colors"><XCircle className="mr-1 h-3 w-3" />Failed</Badge>;
        }
    };

    // ─── Analyze Code ─────────────────────────────────────────────
    const analyzeCode = useCallback(async () => {
        const trimmed = code.trim();
        if (!trimmed) {
            toast.warning("Please paste some code to analyze");
            return;
        }
        if (trimmed.length > MAX_CODE_LENGTH) {
            toast.error(`Code exceeds ${MAX_CODE_LENGTH} character limit`);
            return;
        }

        setError(null);
        setDsaError(null);
        setIsAnalyzing(true);
        setProgress(5);
        setTotalDuration(null);

        // Initialize all agents as pending
        const agentIds: AgentId[] = ["complexity", "security", "refactor", "docs"];
        const initialAgents: AgentResult[] = agentIds.map((id) => ({
            id,
            name: AGENT_META[id].name,
            emoji: AGENT_META[id].emoji,
            status: "running" as AgentStatus,
            result: "",
            durationMs: 0,
        }));
        setAgents(initialAgents);
        setProgress(15);

        try {
            const startTime = Date.now();

            const response = await fetch("/api/agents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: trimmed }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: "Analysis failed" }));
                // Special handling for DSA-only restriction
                if (response.status === 422 && errData.code === "NOT_DSA_CODE") {
                    setDsaError(errData.message || "Only DSA and SQL code is supported.");
                    setAgents([]);
                    return;
                }
                throw new Error(errData.error || `Server error: ${response.status}`);
            }

            const contentType = response.headers.get("content-type") || "";

            if (contentType.includes("text/event-stream")) {
                // ── SSE Streaming Mode ──
                const reader = response.body?.getReader();
                if (!reader) throw new Error("No readable stream");

                const decoder = new TextDecoder();
                let buffer = "";
                let completedCount = 0;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const events = buffer.split("\n\n");
                    buffer = events.pop() || "";

                    for (const event of events) {
                        const lines = event.split("\n");
                        const eventTypeLine = lines.find((l) => l.startsWith("event: "));
                        const dataLine = lines.find((l) => l.startsWith("data: "));
                        if (!eventTypeLine || !dataLine) continue;

                        const eventType = eventTypeLine.replace("event: ", "");
                        const data = JSON.parse(dataLine.replace("data: ", ""));

                        const mapAgentId = (id: string): AgentId => {
                            if (id === "documentation") return "docs";
                            return id as AgentId;
                        };

                        if (eventType === "agent-chunk" && data.agentId) {
                            const aid = mapAgentId(data.agentId);
                            setAgents((prev) =>
                                prev.map((a) =>
                                    a.id === aid ? { ...a, result: a.result + (data.chunk || "") } : a
                                )
                            );
                        } else if (eventType === "agent-complete" && data.agentId) {
                            const aid = mapAgentId(data.agentId);
                            completedCount++;
                            setProgress(15 + (completedCount / agentIds.length) * 85);
                            setAgents((prev) =>
                                prev.map((a) =>
                                    a.id === aid
                                        ? {
                                            ...a,
                                            status: "complete",
                                            result: data.analysis || a.result,
                                            durationMs: data.executionTimeMs || Date.now() - startTime,
                                        }
                                        : a
                                )
                            );
                        } else if (eventType === "agent-error" && data.agentId) {
                            const aid = mapAgentId(data.agentId);
                            completedCount++;
                            setProgress(15 + (completedCount / agentIds.length) * 85);
                            setAgents((prev) =>
                                prev.map((a) =>
                                    a.id === aid
                                        ? { ...a, status: "failed", error: data.error || "Agent failed" }
                                        : a
                                )
                            );
                        }
                    }
                }

                setTotalDuration(Date.now() - startTime);
            } else {
                // ── JSON Response Mode (Raiden API) ──
                const data = await response.json();
                setProgress(100);

                if (data.agents && Array.isArray(data.agents)) {
                    const mapped: AgentResult[] = data.agents.map((a: { id: string; name: string; emoji: string; status: string; result: string; durationMs: number; modelUsed?: string; error?: string }) => ({
                        id: a.id as AgentId,
                        name: a.name,
                        emoji: a.emoji,
                        status: a.status === "success" ? "complete" : "failed",
                        result: a.result || "",
                        durationMs: a.durationMs || 0,
                        modelUsed: a.modelUsed,
                        error: a.status === "error" ? (a.error || "Agent failed") : undefined,
                    }));
                    setAgents(mapped);
                    setTotalDuration(data.totalDurationMs || Date.now() - startTime);
                }
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Analysis failed";
            setError(message);
            setAgents((prev) => prev.map((a) => ({ ...a, status: "failed" as AgentStatus })));
        } finally {
            setIsAnalyzing(false);
            setProgress(100);
        }
    }, [code]);

    /** Copy agent result to clipboard */
    const copyResult = (content: string, agentName: string) => {
        navigator.clipboard.writeText(content);
        toast.success(`${agentName} results copied to clipboard`);
    };

    /** Paste from clipboard into code input */
    const pasteFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setCode(text);
            toast.success("Code pasted from clipboard");
        } catch {
            toast.error("Failed to read clipboard");
        }
    };

    /** Export all results as markdown */
    const exportResults = () => {
        const markdown = agents
            .filter((a) => a.status === "complete")
            .map((a) => `## ${a.emoji} ${a.name}\n\n${a.result}`)
            .join("\n\n---\n\n");

        const blob = new Blob([markdown], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "devmind-analysis.md";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Results exported as markdown");
    };

    /** Download history record as markdown */
    const downloadHistoryMd = (historyRecord: HistoryRecord) => {
        const agentsPart = historyRecord.agents
            .filter((a) => a.status === "complete")
            .map((a) => `## ${a.emoji} ${a.name}\n\n${a.result}`)
            .join("\n\n---\n\n");
            
        const markdown = `# DevMind Analysis History\n**Date:** ${historyRecord.date}\n\n## Input Code\n\`\`\`javascript\n${historyRecord.code}\n\`\`\`\n\n---\n\n${agentsPart}`;

        const blob = new Blob([markdown], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `devmind-analysis-${historyRecord.id}.md`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("History log exported as markdown");
    };

    /** Load history record into view */
    const loadHistory = (historyRecord: HistoryRecord) => {
        setCode(historyRecord.code);
        setAgents(historyRecord.agents);
        setTotalDuration(historyRecord.totalDuration);
        setIsHistoryOpen(false);
        toast.success("Loaded history record");
    };

    const completedAgents = agents.filter((a) => a.status === "complete");
    const hasResults = completedAgents.length > 0;

    /**
     * Parse security findings from the security agent result text.
     * Looks for severity patterns like [CRITICAL], [HIGH], etc.
     */
    const parseSecurityFindings = (text: string): Array<{ severity: string; issue: string; line: string; recommendation: string }> => {
        const findings: Array<{ severity: string; issue: string; line: string; recommendation: string }> = [];
        const severityRegex = new RegExp('[*]{0,2}\\[?(CRITICAL|HIGH|MEDIUM|LOW|INFO)\\]?[*]{0,2}\\s*[:\\-]?\\s*(.+)', 'gi');

        let match;

        while ((match = severityRegex.exec(text)) !== null) {
            findings.push({
                severity: match[1],
                issue: match[2].trim().slice(0, 80),
                line: "–",
                recommendation: "See full analysis above",
            });
        }

        return findings;
    };

    return (
        <div className="h-screen overflow-hidden bg-background flex flex-col">
            {/* ─── Header ────────────────────────────────────── */}
            <header className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-4 py-3">
                <div className="flex items-center gap-3">
                    <Link href="/" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Back to home">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <Separator orientation="vertical" className="h-6" />
                    <Brain className="h-6 w-6 text-primary" />
                    <div>
                        <h1 className="text-lg font-semibold">Multi-Agent Analyzer</h1>
                        <p className="text-xs text-muted-foreground">4 agents · Parallel execution</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                        <SheetTrigger render={<Button variant="outline" size="sm" className="gap-1.5 hidden sm:flex" />}>
                            <History className="h-4 w-4" />
                            History
                        </SheetTrigger>
                        <SheetContent side="right" className="w-[400px] sm:w-[540px] overflow-y-auto">
                            <SheetHeader>
                                <SheetTitle>Analysis History</SheetTitle>
                                <SheetDescription>
                                    Your past {history.length} code analyses are securely saved in your browser.
                                </SheetDescription>
                            </SheetHeader>
                            <div className="mt-6 flex flex-col gap-4">
                                {history.length === 0 ? (
                                    <div className="flex flex-col flex-1 items-center justify-center p-8 mt-10 opacity-50 space-y-4">
                                        <History className="h-12 w-12 text-muted-foreground" />
                                        <p className="text-sm text-center text-muted-foreground">Your history will appear here once you run an analysis.</p>
                                    </div>
                                ) : (
                                    history.map(record => (
                                        <Card key={record.id} className="p-3 transition-colors hover:bg-muted/30">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{record.date}</span>
                                                <Tooltip>
                                                    <TooltipTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadHistoryMd(record)} />}>
                                                        <FileDown className="h-4 w-4 text-muted-foreground" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>Download MD</TooltipContent>
                                                </Tooltip>
                                            </div>
                                            <pre className="p-2.5 bg-muted/50 rounded-md text-[10.5px] overflow-hidden whitespace-pre-wrap line-clamp-3 text-ellipsis mb-3 font-mono border border-border/50">
                                                {record.codeSnippet}
                                            </pre>
                                            <div className="flex gap-2 w-full">
                                                <Button className="w-full h-8 text-xs font-medium" variant="secondary" onClick={() => loadHistory(record)}>
                                                    Open in Analyzer
                                                </Button>
                                            </div>
                                        </Card>
                                    ))
                                )}
                            </div>
                        </SheetContent>
                    </Sheet>
                    <HoverCard>
                        <HoverCardTrigger>
                            <Badge variant="outline" className="cursor-help hidden md:inline-flex">
                                4 Agents · Parallel
                            </Badge>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-72">
                            <p className="text-sm">
                                All 4 agents run simultaneously using <code>Promise.allSettled()</code>.
                                Total analysis time equals the slowest agent, not the sum of all four.
                                If one agent fails, the others still return results.
                            </p>
                        </HoverCardContent>
                    </HoverCard>
                    <ModeToggle />
                </div>
            </header>

            <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl px-4 py-6">
                {/* ─── Top-level success alert ─── */}
                {totalDuration !== null && !isAnalyzing && (
                    <Alert className="mb-6">
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertTitle>Analysis Complete</AlertTitle>
                        <AlertDescription>
                            Completed in {(totalDuration / 1000).toFixed(1)}s — {completedAgents.length} agent{completedAgents.length !== 1 ? "s" : ""} ran in parallel
                            {agents.some((a) => a.status === "failed") && (
                                <span className="text-destructive"> · {agents.filter((a) => a.status === "failed").length} failed</span>
                            )}
                        </AlertDescription>
                    </Alert>
                )}

                {/* ─── Error alert ─── */}
                {error && (
                    <Alert variant="destructive" className="mb-6">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Analysis Failed</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {/* ─── DSA-only restriction alert ─── */}
                {dsaError && (
                    <Alert className="mb-6 border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                        <AlertTitle className="text-yellow-600 dark:text-yellow-400">DSA / SQL Code Only</AlertTitle>
                        <AlertDescription className="whitespace-pre-line text-yellow-700/90 dark:text-yellow-400/90 text-sm mt-1">
                            {dsaError}
                        </AlertDescription>
                    </Alert>
                )}

                <div className="grid gap-6 lg:grid-cols-5">
                    {/* ─── Code Input Panel (Left) ─── */}
                    <div className="lg:col-span-2 flex flex-col lg:sticky lg:top-6 lg:max-h-[calc(100vh-140px)] max-h-[600px]">
                        <Card className="flex flex-col h-full">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    Paste Your Code
                                </CardTitle>
                                <CardDescription>
                                    Submit any code snippet for analysis by 4 specialized AI agents.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-3 overflow-y-auto flex-1">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="code-input">Source Code</Label>
                                    <Tooltip>
                                        <TooltipTrigger
                                            className={buttonVariants({ variant: "ghost", size: "sm", className: "h-7 text-xs" })}
                                            onClick={pasteFromClipboard}
                                            aria-label="Paste from clipboard"
                                        >
                                            <ClipboardPaste className="mr-1 h-3 w-3" />
                                            Paste
                                        </TooltipTrigger>
                                        <TooltipContent>Paste code from clipboard</TooltipContent>
                                    </Tooltip>
                                </div>
                                <Textarea
                                    ref={textareaRef}
                                    id="code-input"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    placeholder={`// DSA / SQL only\n// e.g. sorting algorithms, trees, graphs, SQL queries\nfunction fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n-1) + fibonacci(n-2);\n}`}
                                    className="resize-none flex-1 font-mono text-sm overflow-y-auto [field-sizing:fixed]"
                                    disabled={isAnalyzing}
                                    aria-label="Code input for analysis"
                                />
                                {/* Character count + warning */}
                                <div className="flex items-center justify-between">
                                    <Badge
                                        variant={code.length > MAX_CODE_LENGTH ? "destructive" : "outline"}
                                        className="text-xs"
                                    >
                                        {code.length} / {MAX_CODE_LENGTH}
                                    </Badge>
                                    {code.length > MAX_CODE_LENGTH && (
                                        <span className="text-xs text-destructive">
                                            Exceeds limit by {code.length - MAX_CODE_LENGTH} chars
                                        </span>
                                    )}
                                </div>
                            </CardContent>
                            <CardFooter className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setCode("")}
                                    disabled={!code || isAnalyzing}
                                    aria-label="Clear code"
                                >
                                    <Trash2 className="mr-1 h-4 w-4" />
                                    Clear
                                </Button>
                                <Button
                                    className="flex-1 gap-2"
                                    onClick={analyzeCode}
                                    disabled={isAnalyzing || !code.trim() || code.length > MAX_CODE_LENGTH}
                                    aria-label="Analyze code"
                                >
                                    {isAnalyzing ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Analyzing...
                                        </>
                                    ) : (
                                        <>
                                            <Zap className="h-4 w-4" />
                                            Analyze Code
                                        </>
                                    )}
                                </Button>
                            </CardFooter>
                        </Card>
                    </div>

                    {/* ─── Results Panel (Right) ─── */}
                    <div className="lg:col-span-3">
                        {/* Progress bar during analysis */}
                        {isAnalyzing && (
                            <div className="mb-4 space-y-2">
                                <Progress value={progress} className="h-2" />
                                <div className="flex flex-wrap gap-2">
                                    {agents.map((agent) => (
                                        <div key={agent.id} className="flex items-center gap-1.5">
                                            <span className="text-sm">{agent.emoji}</span>
                                            {getStatusBadge(agent.status)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* No results placeholder */}
                        {!hasResults && !isAnalyzing && agents.length === 0 && (
                            <div className="flex items-center justify-center py-20">
                                <Card className="w-full max-w-sm text-center">
                                    <CardHeader>
                                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                                            <Brain className="h-7 w-7 text-primary" />
                                        </div>
                                        <CardTitle>Ready to Analyze</CardTitle>
                                        <CardDescription>
                                            Paste your code on the left and click Analyze to see results from 4 specialized AI agents.
                                        </CardDescription>
                                    </CardHeader>
                                </Card>
                            </div>
                        )}

                        {/* Agent results in 2x2 grid */}
                        {agents.length > 0 && !isAnalyzing && (
                            <>
                                {/* Export button */}
                                {hasResults && (
                                    <div className="mb-4 flex justify-end">
                                        <Dialog>
                                            <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}>
                                                <FileDown className="h-4 w-4" />
                                                Export All Results
                                            </DialogTrigger>
                                            <DialogContent className="max-w-lg">
                                                <DialogHeader>
                                                    <DialogTitle>Export Analysis Results</DialogTitle>
                                                    <DialogDescription>
                                                        Download the results from all {completedAgents.length} completed agents as a Markdown file.
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <div className="max-h-60 overflow-y-auto rounded-md border p-3">
                                                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                                                        {completedAgents
                                                            .map((a) => `## ${a.emoji} ${a.name}\n\n${a.result.slice(0, 200)}...`)
                                                            .join("\n\n---\n\n")}
                                                    </pre>
                                                </div>
                                                <DialogFooter>
                                                    <Button variant="outline" onClick={() => { }}>
                                                        Cancel
                                                    </Button>
                                                    <Button onClick={exportResults} className="gap-1.5">
                                                        <FileDown className="h-4 w-4" />
                                                        Download .md
                                                    </Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                )}

                                {/* Tabs for each agent */}
                                <Tabs defaultValue="complexity">
                                    <TabsList className="grid w-full grid-cols-4">
                                        {(["complexity", "security", "refactor", "docs"] as AgentId[]).map((id) => {
                                            const meta = AGENT_META[id];
                                            const agent = agents.find((a) => a.id === id);
                                            return (
                                                <TabsTrigger key={id} value={id} className="gap-1.5 text-xs sm:text-sm">
                                                    <span>{meta.emoji}</span>
                                                    <span className="hidden sm:inline">{meta.name.split(" ")[0]}</span>
                                                    {agent?.status === "complete" && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                                                    {agent?.status === "failed" && <XCircle className="h-3 w-3 text-destructive" />}
                                                </TabsTrigger>
                                            );
                                        })}
                                    </TabsList>

                                    {(["complexity", "security", "refactor", "docs"] as AgentId[]).map((id) => {
                                        const agent = agents.find((a) => a.id === id);
                                        const meta = AGENT_META[id];
                                        const IconComp = meta.icon;

                                        return (
                                            <TabsContent key={id} value={id} className="mt-4">
                                                <Card className="animate-agent-card">
                                                    <CardHeader className="flex flex-row items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10`}>
                                                                <IconComp className={`h-5 w-5 ${meta.color}`} />
                                                            </div>
                                                            <div>
                                                                <CardTitle className="text-lg">{meta.emoji} {meta.name}</CardTitle>
                                                                {agent?.durationMs ? (
                                                                    <CardDescription className="flex items-center gap-2 flex-wrap">
                                                                        <span className="flex items-center gap-1">
                                                                            <Clock className="h-3 w-3" />
                                                                            {(agent.durationMs / 1000).toFixed(1)}s
                                                                        </span>
                                                                        {agent.modelUsed && (
                                                                            <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                                                                {agent.modelUsed}
                                                                            </span>
                                                                        )}
                                                                    </CardDescription>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {agent && getStatusBadge(agent.status)}
                                                            {agent?.status === "complete" && (
                                                                <Tooltip>
                                                                    <TooltipTrigger
                                                                        className={buttonVariants({ variant: "ghost", size: "icon", className: "h-8 w-8" })}
                                                                        onClick={() => copyResult(agent.result, meta.name)}
                                                                        aria-label={`Copy ${meta.name} results`}
                                                                    >
                                                                        <Copy className="h-4 w-4" />
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>Copy results</TooltipContent>
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                    </CardHeader>
                                                    <CardContent>
                                                        {/* Loading skeleton */}
                                                        {(agent?.status === "running" || agent?.status === "pending") && (
                                                            <div className="space-y-3">
                                                                <Skeleton className="h-4 w-3/4" />
                                                                <Skeleton className="h-4 w-full" />
                                                                <Skeleton className="h-4 w-5/6" />
                                                                <Skeleton className="h-4 w-2/3" />
                                                                <Skeleton className="h-4 w-4/5" />
                                                            </div>
                                                        )}

                                                        {/* Error state */}
                                                        {agent?.status === "failed" && (
                                                            <Alert variant="destructive">
                                                                <AlertCircle className="h-4 w-4" />
                                                                <AlertTitle>Agent Failed</AlertTitle>
                                                                <AlertDescription>
                                                                    {agent.error || "This agent encountered an error during analysis."}
                                                                </AlertDescription>
                                                            </Alert>
                                                        )}

                                                        {/* Result content */}
                                                        {agent?.status === "complete" && agent.result && (
                                                            <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                                                {/* Security-specific table */}
                                                                {id === "security" && (() => {
                                                                    const findings = parseSecurityFindings(agent.result);
                                                                    if (findings.length > 0) {
                                                                        return (
                                                                            <div className="mb-4">
                                                                                {findings.some((f) => f.severity.toLowerCase() === "critical") && (
                                                                                    <Alert variant="destructive" className="mb-4">
                                                                                        <AlertCircle className="h-4 w-4" />
                                                                                        <AlertTitle>Critical Vulnerabilities Found</AlertTitle>
                                                                                        <AlertDescription>
                                                                                            This code contains critical security issues that require immediate attention.
                                                                                        </AlertDescription>
                                                                                    </Alert>
                                                                                )}
                                                                                <Table>
                                                                                    <TableHeader>
                                                                                        <TableRow>
                                                                                            <TableHead className="w-[100px]">Severity</TableHead>
                                                                                            <TableHead>Issue</TableHead>
                                                                                            <TableHead className="w-[60px]">Line</TableHead>
                                                                                        </TableRow>
                                                                                    </TableHeader>
                                                                                    <TableBody>
                                                                                        {findings.map((finding, idx) => (
                                                                                            <TableRow key={idx}>
                                                                                                <TableCell>
                                                                                                    <SeverityBadge severity={finding.severity} />
                                                                                                </TableCell>
                                                                                                <TableCell className="text-sm">{finding.issue}</TableCell>
                                                                                                <TableCell className="text-sm text-muted-foreground">{finding.line}</TableCell>
                                                                                            </TableRow>
                                                                                        ))}
                                                                                    </TableBody>
                                                                                </Table>
                                                                                <Separator className="my-4" />
                                                                            </div>
                                                                        );
                                                                    }
                                                                    return null;
                                                                })()}

                                                                {/* Common accordion for all agents */}
                                                                <Accordion defaultValue={["full-analysis"]}>
                                                                    <AccordionItem value="full-analysis" className="border-none">
                                                                        <AccordionTrigger>Full Analysis</AccordionTrigger>
                                                                        <AccordionContent>
                                                                            <div className="whitespace-pre-wrap text-sm leading-relaxed pb-4">
                                                                                {agent.result}
                                                                            </div>
                                                                        </AccordionContent>
                                                                    </AccordionItem>
                                                                </Accordion>
                                                            </div>
                                                        )}
                                                    </CardContent>
                                                </Card>
                                            </TabsContent>
                                        );
                                    })}
                                </Tabs>
                            </>
                        )}

                        {/* Loading cards during analysis */}
                        {isAnalyzing && (
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                {agents.map((agent) => (
                                    <Card key={agent.id} className="animate-agent-card" style={{ animationDelay: `${["complexity", "security", "refactor", "docs"].indexOf(agent.id) * 100}ms` }}>
                                        <CardHeader className="pb-3">
                                            <div className="flex items-center justify-between">
                                                <CardTitle className="text-sm">{agent.emoji} {agent.name}</CardTitle>
                                                {getStatusBadge(agent.status)}
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            {agent.result ? (
                                                <p className="text-xs text-muted-foreground line-clamp-3">{agent.result}</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    <Skeleton className="h-3 w-full" />
                                                    <Skeleton className="h-3 w-4/5" />
                                                    <Skeleton className="h-3 w-3/4" />
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ─── Disclaimer ─── */}
                <div className="mt-8">
                    <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs text-muted-foreground">
                            AI analysis is advisory only. Always verify security findings manually and test optimization suggestions before applying them to production code.
                        </AlertDescription>
                    </Alert>
                </div>
            </div>
            </div>
        </div>
    );
}

