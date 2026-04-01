"use client";

/**
 * components/theme-provider.tsx — Next-themes ThemeProvider wrapper.
 * Required for dark/light mode support throughout the application.
 * Wraps the entire app in app/layout.tsx.
 */

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
    return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
