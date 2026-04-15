import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

/**
 * Load Geist font families.
 * Geist Sans is used for body text — clean, modern, excellent for UI.
 * Geist Mono is used for code blocks — monospaced with the same visual weight.
 */
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** SEO metadata for the application */
export const metadata: Metadata = {
  title: "DevMind — AI-Powered Engineering Assistant",
  description:
    "An intelligent engineering co-pilot with multi-agent code analysis. Built with Next.js 14, TypeScript, and Claude AI.",
  keywords: ["AI", "code review", "engineering assistant", "multi-agent", "DevMind"],
};

/**
 * Root Layout — wraps the entire application.
 *
 * Provider hierarchy (outermost to innermost):
 * 1. ThemeProvider — dark/light mode via next-themes (class-based)
 * 2. TooltipProvider — required by all shadcn/ui Tooltip components
 * 3. Page content
 * 4. Toaster — sonner toast notifications (rendered as portal)
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistMono.variable} font-mono antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delay={200}>
            {children}
            <Toaster richColors position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
