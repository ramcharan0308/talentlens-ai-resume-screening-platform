"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ShinyBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: "primary" | "success" | "warning" | "neutral";
  size?: "sm" | "md";
}

export function ShinyBadge({
  children,
  variant = "primary",
  size = "md",
  className,
  ...props
}: ShinyBadgeProps) {
  const variantStyles = {
    primary:
      "bg-primary/10 text-primary border-primary/25 before:from-transparent before:via-primary/30 before:to-transparent",
    success:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25 before:from-transparent before:via-emerald-500/30 before:to-transparent",
    warning:
      "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/25 before:from-transparent before:via-amber-500/30 before:to-transparent",
    neutral:
      "bg-muted text-muted-foreground border-border before:from-transparent before:via-muted-foreground/20 before:to-transparent",
  };

  const sizeStyles = {
    sm: "text-[10px] px-2 py-0.5 font-medium tracking-wide",
    md: "text-xs px-2.5 py-1 font-semibold tracking-normal",
  };

  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-full border overflow-hidden select-none",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_3s_infinite] before:bg-gradient-to-r",
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
      {...props}
    >
      <span className="relative z-10 flex items-center gap-1.5">{children}</span>
    </span>
  );
}

