"use client";

/**
 * app/page.tsx — DevMind Landing Page
 *
 * Premium landing page showcasing the two core modules:
 * 1. AI Chat Assistant
 * 2. Multi-Agent Code Analyzer
 *
 * Uses shadcn/ui components exclusively: Card, Badge, Button, Tabs, Accordion.
 */

import Link from "next/link";
import {
  MessageSquare,
  Shield,
  Zap,
  Code2,
  Brain,
  ArrowRight,
  Sparkles,
  FileCode,
  Bot,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { ModeToggle } from "@/components/mode-toggle";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ─── Top Navigation Bar ─── */}
      <header className="sticky top-0 z-50 border-b border-border glass">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold gradient-text">DevMind</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/chat" className={buttonVariants({ variant: "ghost" })}>
              Chat
            </Link>
            <Link href="/agents" className={buttonVariants({ variant: "ghost" })}>
              Agents
            </Link>
            <Separator orientation="vertical" className="h-6" />
            <ModeToggle />
          </nav>
        </div>
      </header>

      {/* ─── Hero Section ─── */}
      <section className="relative overflow-hidden hero-gradient">
        <div className="mx-auto max-w-6xl px-4 py-24 text-center">
          <Badge variant="outline" className="mb-6 px-4 py-1.5 text-sm">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Powered by Claude claude-sonnet-4-20250514
          </Badge>
          <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            Your AI{" "}
            <span className="gradient-text">Engineering</span>
            <br />
            Assistant
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground">
            An intelligent co-pilot that reviews your code like a senior colleague,
            audits security like an expert, and explains concepts like a great teacher —
            all powered by multi-agent AI running in parallel.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/chat" className={buttonVariants({ size: "lg", className: "gap-2" })}>
              <MessageSquare className="h-5 w-5" />
              Start Chatting
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/agents" className={buttonVariants({ size: "lg", variant: "outline", className: "gap-2" })}>
              <Code2 className="h-5 w-5" />
              Analyze Code
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Feature Cards ─── */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-3xl font-bold">Two Powerful Modules</h2>
          <p className="text-muted-foreground">Choose your workflow — or use both together.</p>
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          {/* Chat Module Card */}
          <Card className="group relative overflow-hidden transition-all hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30">
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">AI Chat Assistant</CardTitle>
              <CardDescription className="text-base">
                A persistent engineering co-pilot with full conversation memory and real-time streaming responses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Streaming</Badge>
                <Badge variant="secondary">Context Memory</Badge>
                <Badge variant="secondary">Code Explanation</Badge>
                <Badge variant="secondary">Debug Help</Badge>
                <Badge variant="secondary">Architecture</Badge>
              </div>
            </CardContent>
            <CardFooter>
              <Link href="/chat" className={buttonVariants({ variant: "outline", className: "w-full gap-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors" })}>
                Open Chat
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </CardFooter>
          </Card>

          {/* Agent Analyzer Card */}
          <Card className="group relative overflow-hidden transition-all hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30">
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">Multi-Agent Analyzer</CardTitle>
              <CardDescription className="text-base">
                Four specialized AI agents analyze your code simultaneously — complexity, security, refactoring, and documentation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">⚡ Complexity</Badge>
                <Badge variant="secondary">🔒 Security</Badge>
                <Badge variant="secondary">🔧 Refactor</Badge>
                <Badge variant="secondary">📝 Docs</Badge>
              </div>
            </CardContent>
            <CardFooter>
              <Link href="/agents" className={buttonVariants({ variant: "outline", className: "w-full gap-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors" })}>
                Analyze Code
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </CardFooter>
          </Card>
        </div>
      </section>

      {/* ─── Stats Row ─── */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-px sm:grid-cols-3">
          {[
            { icon: Bot, label: "4 AI Agents", desc: "Specialized analysts" },
            { icon: Layers, label: "Parallel Execution", desc: "All agents run simultaneously" },
            { icon: Zap, label: "Real-time Streaming", desc: "Token-by-token output" },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-4 bg-background/50 px-8 py-8">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <stat.icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold">{stat.label}</p>
                <p className="text-sm text-muted-foreground">{stat.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-3xl font-bold">How It Works</h2>
          <p className="text-muted-foreground">Simple, powerful, fast.</p>
        </div>
        <Tabs defaultValue="chat" className="mx-auto max-w-2xl">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="chat">
              <MessageSquare className="mr-2 h-4 w-4" />
              Chat Module
            </TabsTrigger>
            <TabsTrigger value="agents">
              <Bot className="mr-2 h-4 w-4" />
              Agent Analyzer
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="mt-6">
            <Accordion defaultValue={["step-1"]}>
              <AccordionItem value="step-1">
                <AccordionTrigger>1. Ask a technical question</AccordionTrigger>
                <AccordionContent>
                  Type any engineering question — from Big O analysis to system design.
                  DevMind understands code, architecture, and CS fundamentals deeply.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="step-2">
                <AccordionTrigger>2. Watch the response stream in real-time</AccordionTrigger>
                <AccordionContent>
                  DevMind streams its response token-by-token, just like ChatGPT.
                  You see the answer forming in real-time with a blinking cursor.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="step-3">
                <AccordionTrigger>3. Continue the conversation with full context</AccordionTrigger>
                <AccordionContent>
                  Every message is kept in context. DevMind remembers your entire
                  session, so you can build on previous answers and go deeper.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>
          <TabsContent value="agents" className="mt-6">
            <Accordion defaultValue={["step-1"]}>
              <AccordionItem value="step-1">
                <AccordionTrigger>1. Paste your code</AccordionTrigger>
                <AccordionContent>
                  Drop any code snippet — Python, JavaScript, Java, C++, or any language.
                  Up to 4,000 characters per analysis.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="step-2">
                <AccordionTrigger>2. Four agents analyze simultaneously</AccordionTrigger>
                <AccordionContent>
                  Complexity Analyst, Security Auditor, Refactor Advisor, and Documentation Generator
                  all run in true parallel. Total time equals the slowest agent, not the sum.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="step-3">
                <AccordionTrigger>3. Review structured results</AccordionTrigger>
                <AccordionContent>
                  Each agent presents its findings in a structured card with severity badges,
                  confidence scores, and actionable recommendations you can copy.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>
        </Tabs>
      </section>

      {/* ─── Architecture Highlights ─── */}
      <section className="border-t border-border bg-muted/20">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold">Built with Modern Architecture</h2>
            <p className="text-muted-foreground">Production-grade patterns, not just a demo.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Zap, title: "Edge Runtime", desc: "Zero cold-start latency with Vercel Edge" },
              { icon: Shield, title: "Secure by Design", desc: "API keys never leave the server" },
              { icon: Layers, title: "Promise.allSettled()", desc: "Error isolation per agent" },
              { icon: FileCode, title: "TypeScript Strict", desc: "Full type safety, no 'any' types" },
              { icon: Brain, title: "Agentic AI", desc: "Specialized agents with tool use" },
              { icon: Sparkles, title: "SSE Streaming", desc: "Real-time per-agent output" },
            ].map((item) => (
              <Card key={item.title} className="bg-background/50 transition-colors hover:bg-background">
                <CardHeader className="pb-3">
                  <item.icon className="mb-2 h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Brain className="h-4 w-4" />
            <span>DevMind v1.0 — AI-Powered Engineering Assistant</span>
          </div>
          <p className="text-sm text-muted-foreground">Built with Next.js 14, TypeScript & Claude AI</p>
        </div>
      </footer>
    </div>
  );
}
