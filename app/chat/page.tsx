"use client";

/**
 * app/chat/page.tsx — AI Chat Interface with Chat History
 *
 * Full-featured chat UI with:
 * - Real-time streaming via ReadableStream + TextDecoder
 * - Conversation history persisted in localStorage
 * - Collapsible sidebar with saved conversations
 * - Auto-scroll to latest message
 * - Enter-to-send, Shift+Enter for newline
 * - Per-message actions (copy, delete)
 * - Empty state with suggestion chips
 * - Error handling with inline alerts
 *
 * All UI built exclusively with shadcn/ui components.
 */

import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type FormEvent } from "react";
import Link from "next/link";
import {
    Brain,
    Send,
    Copy,
    Trash2,
    RotateCcw,
    Sparkles,
    MessageSquare,
    ArrowLeft,
    Loader2,
    AlertCircle,
    MoreVertical,
    User,
    Bot,
    Plus,
    PanelLeftClose,
    PanelLeft,
    Clock,
    Pencil,
    Check,
    X,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ModeToggle } from "@/components/mode-toggle";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────

/** Single chat message */
interface Message {
    role: "user" | "assistant";
    content: string;
    id: string;
}

/** A saved conversation with metadata */
interface Conversation {
    id: string;
    title: string;
    messages: Message[];
    createdAt: number;
    updatedAt: number;
}

// ─── Constants ───────────────────────────────────────────────────

const STORAGE_KEY = "devmind-chat-history";
const MAX_CONVERSATIONS = 50;

// ─── Helpers ─────────────────────────────────────────────────────

function generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Derive a title from the first user message */
function deriveTitle(messages: Message[]): string {
    const firstUser = messages.find((m) => m.role === "user");
    if (!firstUser) return "New Conversation";
    const text = firstUser.content.trim();
    return text.length > 40 ? text.slice(0, 40) + "…" : text;
}

/** Read conversations from localStorage */
function loadConversations(): Conversation[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as Conversation[];
        // Sort newest first
        return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
        return [];
    }
}

/** Write conversations to localStorage */
function saveConversations(convos: Conversation[]): void {
    if (typeof window === "undefined") return;
    try {
        // Keep only the most recent MAX_CONVERSATIONS
        const trimmed = convos
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, MAX_CONVERSATIONS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
        console.warn("Failed to save chat history to localStorage");
    }
}

/** Relative time label */
function timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
}

// ─── Component ───────────────────────────────────────────────────

export default function ChatPage() {
    // ─── State ────────────────────────────────────────────────────
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newSession, setNewSession] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState("");
    const [mounted, setMounted] = useState(false);

    // ─── Refs ─────────────────────────────────────────────────────
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ─── Load from localStorage on mount ──────────────────────────
    useEffect(() => {
        const saved = loadConversations();
        setConversations(saved);
        // If there are saved conversations, load the most recent one
        if (saved.length > 0) {
            setActiveConvoId(saved[0].id);
            setMessages(saved[0].messages);
        }
        setMounted(true);
    }, []);

    /** Auto-scroll to the bottom whenever messages change */
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    /** Auto-resize textarea based on content */
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [input]);

    // ─── Persist to localStorage whenever conversations change ────
    useEffect(() => {
        if (mounted && conversations.length > 0) {
            saveConversations(conversations);
        }
    }, [conversations, mounted]);

    // ─── Sync current messages back into conversations state ──────
    const syncMessages = useCallback(
        (msgs: Message[], convoId: string | null) => {
            if (!convoId || msgs.length === 0) return;

            setConversations((prev) => {
                const existing = prev.find((c) => c.id === convoId);
                if (existing) {
                    return prev.map((c) =>
                        c.id === convoId
                            ? {
                                ...c,
                                messages: msgs,
                                title: c.title === "New Conversation" ? deriveTitle(msgs) : c.title,
                                updatedAt: Date.now(),
                            }
                            : c
                    );
                } else {
                    return [
                        {
                            id: convoId,
                            title: deriveTitle(msgs),
                            messages: msgs,
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                        },
                        ...prev,
                    ];
                }
            });
        },
        []
    );

    // ─── Conversation Management ─────────────────────────────────

    /** Start a brand new conversation */
    const startNewConversation = () => {
        if (isStreaming) return;
        const newId = generateConversationId();
        setActiveConvoId(newId);
        setMessages([]);
        setError(null);
        setInput("");
    };

    /** Switch to an existing conversation */
    const switchConversation = (convoId: string) => {
        if (isStreaming) return;
        const convo = conversations.find((c) => c.id === convoId);
        if (convo) {
            setActiveConvoId(convo.id);
            setMessages(convo.messages);
            setError(null);
            setInput("");
        }
    };

    /** Delete a conversation */
    const deleteConversation = (convoId: string) => {
        setConversations((prev) => {
            const filtered = prev.filter((c) => c.id !== convoId);
            saveConversations(filtered);
            return filtered;
        });
        // If we deleted the active conversation, switch or clear
        if (convoId === activeConvoId) {
            const remaining = conversations.filter((c) => c.id !== convoId);
            if (remaining.length > 0) {
                setActiveConvoId(remaining[0].id);
                setMessages(remaining[0].messages);
            } else {
                setActiveConvoId(null);
                setMessages([]);
            }
        }
        toast.info("Conversation deleted");
    };

    /** Rename a conversation */
    const renameConversation = (convoId: string, newTitle: string) => {
        const trimmed = newTitle.trim();
        if (!trimmed) return;
        setConversations((prev) =>
            prev.map((c) => (c.id === convoId ? { ...c, title: trimmed, updatedAt: Date.now() } : c))
        );
        setEditingId(null);
        setEditingTitle("");
    };

    // ─── Send Message Handler ────────────────────────────────────
    const sendMessage = useCallback(async () => {
        const trimmed = input.trim();
        if (!trimmed || isStreaming) return;

        setError(null);
        setInput("");

        // If no active conversation, create one
        let currentConvoId = activeConvoId;
        if (!currentConvoId) {
            currentConvoId = generateConversationId();
            setActiveConvoId(currentConvoId);
        }

        // Create user message
        const userMessage: Message = {
            role: "user",
            content: trimmed,
            id: generateId(),
        };

        // Create placeholder assistant message for streaming
        const assistantMessage: Message = {
            role: "assistant",
            content: "",
            id: generateId(),
        };

        const updatedMessages = [...messages, userMessage];
        setMessages([...updatedMessages, assistantMessage]);
        setIsStreaming(true);

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: updatedMessages.map((m) => ({
                        role: m.role,
                        content: m.content,
                    })),
                    newSession,
                }),
            });

            // Reset new session flag after use
            if (newSession) setNewSession(false);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            // ── Stream the response token-by-token ──
            const reader = response.body?.getReader();
            if (!reader) throw new Error("No readable stream in response");

            const decoder = new TextDecoder();
            let accumulated = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                accumulated += chunk;

                // Update the last assistant message with accumulated text
                setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === "assistant") {
                        updated[updated.length - 1] = { ...last, content: accumulated };
                    }
                    return updated;
                });
            }

            // Save the final messages to conversation history
            const finalMessages = [...updatedMessages, { ...assistantMessage, content: accumulated }];
            syncMessages(finalMessages, currentConvoId);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to send message";
            setError(message);

            // Remove the empty assistant message on error
            setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === "assistant" && last.content === "") {
                    return prev.slice(0, -1);
                }
                return prev;
            });

            // Still save the user message
            syncMessages(updatedMessages, currentConvoId);
        } finally {
            setIsStreaming(false);
        }
    }, [input, isStreaming, messages, newSession, activeConvoId, syncMessages]);

    /** Handle keyboard shortcuts: Enter to send, Shift+Enter for newline */
    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    /** Copy message content to clipboard */
    const copyMessage = (content: string) => {
        navigator.clipboard.writeText(content);
        toast.success("Copied to clipboard");
    };

    /** Delete a specific message */
    const deleteMessage = (id: string) => {
        setMessages((prev) => {
            const updated = prev.filter((m) => m.id !== id);
            if (activeConvoId) syncMessages(updated, activeConvoId);
            return updated;
        });
        toast.info("Message deleted");
    };

    /** Clear all messages with confirmation (handled by AlertDialog) */
    const clearAllMessages = () => {
        setMessages([]);
        setError(null);
        if (activeConvoId) {
            setConversations((prev) => prev.filter((c) => c.id !== activeConvoId));
            setActiveConvoId(null);
        }
        toast.success("Conversation cleared");
    };

    /** Handle form submission */
    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        sendMessage();
    };

    /** Retry failed message */
    const retryLastMessage = () => {
        setError(null);
        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
        if (lastUserMsg) {
            setInput(lastUserMsg.content);
            setMessages((prev) => {
                const idx = prev.lastIndexOf(lastUserMsg);
                return prev.slice(0, idx);
            });
        }
    };

    /** Clear all history from localStorage */
    const clearAllHistory = () => {
        setConversations([]);
        setActiveConvoId(null);
        setMessages([]);
        setError(null);
        localStorage.removeItem(STORAGE_KEY);
        toast.success("All chat history cleared");
    };

    return (
        <div className="flex h-screen bg-background">
            {/* ─── Sidebar ────────────────────────────────────── */}
            <aside
                className={cn(
                    "flex h-full flex-col border-r border-border bg-muted/30 transition-all duration-300",
                    sidebarOpen ? "w-72" : "w-0 overflow-hidden border-r-0"
                )}
            >
                {/* Sidebar Header */}
                <div className="flex items-center justify-between border-b border-border px-3 py-3">
                    <h2 className="text-sm font-semibold text-foreground truncate">Chat History</h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={startNewConversation}
                        aria-label="New conversation"
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>

                {/* Conversation List */}
                <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                        {conversations.length === 0 ? (
                            <div className="px-3 py-8 text-center">
                                <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                                <p className="text-xs text-muted-foreground">No conversations yet</p>
                                <p className="text-xs text-muted-foreground mt-1">Start chatting to save history</p>
                            </div>
                        ) : (
                            conversations.map((convo) => (
                                <div
                                    key={convo.id}
                                    className={cn(
                                        "group relative flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors",
                                        convo.id === activeConvoId
                                            ? "bg-primary/10 text-primary font-medium"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                    )}
                                    onClick={() => switchConversation(convo.id)}
                                >
                                    <MessageSquare className="h-4 w-4 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        {editingId === convo.id ? (
                                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                <Input
                                                    value={editingTitle}
                                                    onChange={(e) => setEditingTitle(e.target.value)}
                                                    className="h-6 text-xs px-1"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") renameConversation(convo.id, editingTitle);
                                                        if (e.key === "Escape") { setEditingId(null); setEditingTitle(""); }
                                                    }}
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 shrink-0"
                                                    onClick={() => renameConversation(convo.id, editingTitle)}
                                                >
                                                    <Check className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 shrink-0"
                                                    onClick={() => { setEditingId(null); setEditingTitle(""); }}
                                                >
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <>
                                                <p className="truncate text-sm">{convo.title}</p>
                                                <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                                                    <Clock className="h-2.5 w-2.5" />
                                                    {mounted ? timeAgo(convo.updatedAt) : ""}
                                                    <span className="mx-0.5">·</span>
                                                    {convo.messages.length} msg{convo.messages.length !== 1 ? "s" : ""}
                                                </p>
                                            </>
                                        )}
                                    </div>

                                    {/* Conversation actions (visible on hover) */}
                                    {editingId !== convo.id && (
                                        <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger
                                                    className={buttonVariants({ variant: "ghost", size: "icon", className: "h-6 w-6" })}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <MoreVertical className="h-3 w-3" />
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" side="right">
                                                    <DropdownMenuItem
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingId(convo.id);
                                                            setEditingTitle(convo.title);
                                                        }}
                                                    >
                                                        <Pencil className="mr-2 h-3.5 w-3.5" />
                                                        Rename
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteConversation(convo.id);
                                                        }}
                                                        className="text-destructive"
                                                    >
                                                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>

                {/* Sidebar Footer */}
                {conversations.length > 0 && (
                    <div className="border-t border-border p-2">
                        <AlertDialog>
                            <AlertDialogTrigger className={buttonVariants({ variant: "ghost", size: "sm", className: "w-full text-xs text-muted-foreground justify-start gap-2" })}>
                                <Trash2 className="h-3 w-3" />
                                Clear all history
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Clear all chat history?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will permanently delete all {conversations.length} saved conversations.
                                        This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={clearAllHistory}>
                                        Clear All
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                )}
            </aside>

            {/* ─── Main Chat Area ──────────────────────────────── */}
            <div className="flex flex-1 flex-col min-w-0">
                {/* ─── Header ────────────────────────────────────── */}
                <header className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                        >
                            {sidebarOpen ? (
                                <PanelLeftClose className="h-5 w-5" />
                            ) : (
                                <PanelLeft className="h-5 w-5" />
                            )}
                        </Button>
                        <Link href="/" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Back to home">
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <Separator orientation="vertical" className="h-6" />
                        <Brain className="h-6 w-6 text-primary" />
                        <div>
                            <h1 className="text-lg font-semibold">DevMind Chat</h1>
                            <p className="text-xs text-muted-foreground">AI Engineering Assistant</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Tooltip>
                            <TooltipTrigger
                                className={buttonVariants({ variant: "outline", size: "sm", className: "hidden sm:flex gap-1.5 text-xs" })}
                                onClick={startNewConversation}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                New Chat
                            </TooltipTrigger>
                            <TooltipContent>Start a new conversation</TooltipContent>
                        </Tooltip>
                        <Badge variant="outline" className="hidden md:flex">
                            claude-sonnet-4 via Raiden API
                        </Badge>
                        <ModeToggle />
                    </div>
                </header>

                {/* ─── Messages Area ─────────────────────────────── */}
                <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                    <div className="mx-auto max-w-3xl space-y-6">
                        {messages.length === 0 ? (
                            /* ─── Empty State ─── */
                            <div className="flex items-center justify-center py-20">
                                <Card className="w-full max-w-md text-center">
                                    <CardHeader>
                                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                                            <Sparkles className="h-7 w-7 text-primary" />
                                        </div>
                                        <CardTitle>Start a Conversation</CardTitle>
                                        <CardDescription>
                                            Ask DevMind anything about engineering, code, architecture, or CS concepts.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <p className="mb-3 text-sm text-muted-foreground">Try these starters:</p>
                                        {[
                                            "Explain Big O notation with examples",
                                            "Review my sorting algorithm",
                                            "Design a REST API for a todo app",
                                        ].map((suggestion) => (
                                            <Button
                                                key={suggestion}
                                                variant="outline"
                                                className="w-full justify-start text-left text-sm"
                                                onClick={() => {
                                                    setInput(suggestion);
                                                    textareaRef.current?.focus();
                                                }}
                                            >
                                                <MessageSquare className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                                                {suggestion}
                                            </Button>
                                        ))}
                                    </CardContent>
                                </Card>
                            </div>
                        ) : (
                            /* ─── Message List ─── */
                            messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`group flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"
                                        }`}
                                >
                                    {/* Avatar */}
                                    <Avatar className="h-8 w-8 shrink-0">
                                        <AvatarFallback
                                            className={
                                                msg.role === "user"
                                                    ? "bg-primary text-primary-foreground text-xs"
                                                    : "bg-secondary text-secondary-foreground text-xs"
                                            }
                                        >
                                            {msg.role === "user" ? (
                                                <User className="h-4 w-4" />
                                            ) : (
                                                <Bot className="h-4 w-4" />
                                            )}
                                        </AvatarFallback>
                                    </Avatar>

                                    {/* Message Bubble */}
                                    <div
                                        className={`relative max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user"
                                            ? "bg-primary text-primary-foreground rounded-br-sm"
                                            : "bg-muted rounded-bl-sm"
                                            }`}
                                    >
                                        {/* Streaming cursor */}
                                        {msg.role === "assistant" && isStreaming && msg === messages[messages.length - 1] ? (
                                            <>
                                                <div className="whitespace-pre-wrap">{msg.content}</div>
                                                <span className="inline-block h-4 w-1.5 animate-pulse bg-primary ml-0.5" />
                                            </>
                                        ) : (
                                            <div className="whitespace-pre-wrap">{msg.content}</div>
                                        )}

                                        {/* Message Actions (visible on hover) */}
                                        {msg.content && !isStreaming && (
                                            <div className="absolute -top-2 right-0 opacity-0 transition-opacity group-hover:opacity-100">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger
                                                        className={buttonVariants({ variant: "ghost", size: "icon", className: "h-7 w-7 rounded-full bg-background shadow-sm" })}
                                                        aria-label="Message actions"
                                                    >
                                                        <MoreVertical className="h-3.5 w-3.5" />
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => copyMessage(msg.content)} aria-label="Copy message">
                                                            <Copy className="mr-2 h-4 w-4" />
                                                            Copy
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => deleteMessage(msg.id)}
                                                            className="text-destructive"
                                                            aria-label="Delete message"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}

                        {/* Streaming indicator */}
                        {isStreaming && (
                            <div className="flex items-center gap-2 pl-11">
                                <Badge variant="secondary" className="gap-1.5">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    DevMind is thinking...
                                </Badge>
                            </div>
                        )}

                        {/* Error alert with retry */}
                        {error && (
                            <Alert variant="destructive" className="mx-auto max-w-lg">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription className="flex items-center justify-between">
                                    <span>{error}</span>
                                    <Button variant="ghost" size="sm" onClick={retryLastMessage} className="ml-2 shrink-0">
                                        <RotateCcw className="mr-1 h-3 w-3" />
                                        Retry
                                    </Button>
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>
                </ScrollArea>

                {/* ─── Input Area ────────────────────────────────── */}
                <div className="border-t border-border bg-background/80 backdrop-blur-sm">
                    <div className="mx-auto max-w-3xl px-4 py-3">
                        {/* Controls row */}
                        <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <Switch
                                        id="new-session"
                                        checked={newSession}
                                        onCheckedChange={setNewSession}
                                        aria-label="Start fresh session"
                                    />
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Label htmlFor="new-session" className="cursor-pointer text-xs text-muted-foreground">
                                                New Session
                                            </Label>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Clears AI memory and starts a new conversation context</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                    {messages.length} message{messages.length !== 1 ? "s" : ""}
                                </Badge>
                                {messages.length > 0 && (
                                    <AlertDialog>
                                        <AlertDialogTrigger className={buttonVariants({ variant: "ghost", size: "sm", className: "h-7 text-xs text-muted-foreground" })}>
                                            <Trash2 className="mr-1 h-3 w-3" />
                                            Clear
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Clear conversation?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will permanently delete all {messages.length} messages.
                                                    This action cannot be undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={clearAllMessages}>
                                                    Clear All
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )}
                            </div>
                        </div>

                        {/* Input form */}
                        <form onSubmit={handleSubmit} className="flex gap-2">
                            <Textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask DevMind anything about engineering..."
                                className="min-h-[44px] max-h-[120px] resize-none font-sans"
                                rows={1}
                                disabled={isStreaming}
                                aria-label="Chat message input"
                            />
                            <Tooltip>
                                <TooltipTrigger
                                    type="submit"
                                    className={buttonVariants({ size: "icon", className: "h-[44px] w-[44px] shrink-0" })}
                                    disabled={!input.trim() || isStreaming}
                                    aria-label="Send message"
                                >
                                    {isStreaming ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <Send className="h-5 w-5" />
                                    )}
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Send message (Enter)</p>
                                </TooltipContent>
                            </Tooltip>
                        </form>
                        <p className="mt-1.5 text-center text-xs text-muted-foreground">
                            Shift+Enter for new line · DevMind can make mistakes — always verify critical information.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
