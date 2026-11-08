import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "neutral";
  dot?: boolean;
}

function Badge({ className, variant = "default", dot = false, children, ...props }: BadgeProps) {
  const baseStyles =
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 select-none";

  const variantStyles = {
    default: "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 font-semibold",
    secondary: "border-border/60 bg-secondary/80 text-secondary-foreground hover:bg-secondary",
    destructive: "border-destructive/20 bg-destructive/10 text-destructive dark:bg-destructive/20 hover:bg-destructive/20",
    outline: "text-foreground border-border/80 bg-background/50",
    success: "border-emerald-500/20 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40",
    warning: "border-amber-500/20 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40",
    info: "border-sky-500/20 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/40",
    neutral: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300",
  };

  const dotColors = {
    default: "bg-primary",
    secondary: "bg-muted-foreground",
    destructive: "bg-destructive",
    outline: "bg-foreground/50",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    info: "bg-sky-500",
    neutral: "bg-slate-400",
  };

  return (
    <div className={cn(baseStyles, variantStyles[variant], className)} {...props}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotColors[variant])} />}
      {children}
    </div>
  );
}

export { Badge };
