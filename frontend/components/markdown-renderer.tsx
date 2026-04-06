"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

// KaTeX CSS + Highlight.js theme injected via global CSS — see globals.css
// or imported here dynamically
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

interface Props {
  content: string;
  className?: string;
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-white/5 hover:bg-white/15 transition-colors text-[#8b949e] hover:text-white"
      title="Copy code"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export function MarkdownRenderer({ content, className = "" }: Props) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          // ── Code blocks ──────────────────────────
          pre({ children, ...props }) {
            // Extract raw text from the code element for copy
            const codeEl = (children as any)?.props;
            const raw = codeEl?.children ?? "";
            return (
              <div className="relative group my-4">
                <pre
                  {...props}
                  className="rounded-xl overflow-x-auto text-[13px] leading-relaxed !bg-[#0d1117] border border-[#30363d] p-4"
                >
                  {children}
                </pre>
                <CopyButton code={typeof raw === "string" ? raw : String(raw)} />
              </div>
            );
          },
          // ── Inline code ──────────────────────────
          code({ inline, className, children, ...props }: any) {
            if (inline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded-md bg-muted/80 text-primary text-[0.85em] font-mono border border-border/50"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={`${className ?? ""} font-mono text-[13px]`} {...props}>
                {children}
              </code>
            );
          },
          // ── Tables ───────────────────────────────
          table({ children }) {
            return (
              <div className="overflow-x-auto my-4">
                <table className="w-full border-collapse text-sm">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="px-3 py-2 text-left border border-border/50 bg-muted/30 font-semibold text-foreground/90 text-xs uppercase tracking-wide">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-3 py-2 border border-border/50 text-sm text-foreground/80">
                {children}
              </td>
            );
          },
          // ── Headings ─────────────────────────────
          h1({ children }) {
            return <h1 className="text-2xl font-bold text-foreground mt-6 mb-3 pb-2 border-b border-border/40">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-xl font-semibold text-foreground mt-5 mb-2 pb-1.5 border-b border-border/30">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold text-foreground mt-4 mb-2">{children}</h3>;
          },
          // ── Paragraphs ───────────────────────────
          p({ children }) {
            return <p className="mb-3 leading-7 text-foreground/90 last:mb-0">{children}</p>;
          },
          // ── Lists ────────────────────────────────
          ul({ children }) {
            return <ul className="mb-3 pl-5 space-y-1.5 list-disc marker:text-primary/60">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="mb-3 pl-5 space-y-1.5 list-decimal marker:text-primary/60">{children}</ol>;
          },
          li({ children }) {
            return <li className="text-foreground/90 leading-6">{children}</li>;
          },
          // ── Blockquote ───────────────────────────
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-primary/40 pl-4 my-3 text-muted-foreground italic bg-muted/20 py-2 pr-3 rounded-r-md">
                {children}
              </blockquote>
            );
          },
          // ── Links ────────────────────────────────
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
              >
                {children}
              </a>
            );
          },
          // ── Horizontal Rule ──────────────────────
          hr() {
            return <hr className="border-border/40 my-6" />;
          },
          // ── Strong / Em ──────────────────────────
          strong({ children }) {
            return <strong className="font-semibold text-foreground">{children}</strong>;
          },
          em({ children }) {
            return <em className="italic text-foreground/80">{children}</em>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
