"use client";

/**
 * components/severity-badge.tsx — Maps severity levels to badge variants.
 * Used primarily in the Security Auditor agent results to tag findings.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Props for the SeverityBadge component */
interface SeverityBadgeProps {
    /** Severity level string — case-insensitive */
    severity: string;
    /** Optional additional CSS classes */
    className?: string;
}

/**
 * Returns the appropriate tailwind classes for each severity level.
 * We use custom background colors because shadcn Badge only has
 * default, secondary, destructive, and outline variants.
 */
function getSeverityStyles(severity: string): string {
    switch (severity.toLowerCase()) {
        case "critical":
            return "bg-red-600 text-white hover:bg-red-700 border-red-600";
        case "high":
            return "bg-orange-500 text-white hover:bg-orange-600 border-orange-500";
        case "medium":
            return "bg-yellow-500 text-black hover:bg-yellow-600 border-yellow-500";
        case "low":
            return "bg-secondary text-secondary-foreground hover:bg-secondary/80";
        case "info":
            return "border-border text-muted-foreground";
        default:
            return "";
    }
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
    const variant = severity.toLowerCase() === "info" ? "outline" : "default";

    return (
        <Badge
            variant={variant}
            className={cn(getSeverityStyles(severity), className)}
        >
            {severity.toUpperCase()}
        </Badge>
    );
}
