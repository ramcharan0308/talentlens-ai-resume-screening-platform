"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

export interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  tooltip?: string;
  variant?: "default" | "warning" | "success" | "danger" | "highlight";
  className?: string;
  badge?: string;
}

export function MetricCard({
  label,
  value,
  subtext,
  icon,
  trend,
  tooltip,
  variant = "default",
  className,
  badge,
}: MetricCardProps) {
  const variantStyles = {
    default: "border-border/80 bg-card/90 hover:border-primary/30 shadow-card",
    warning: "border-amber-500/30 bg-amber-500/[0.08]",
    success: "border-emerald-500/30 bg-emerald-500/[0.08]",
    danger: "border-rose-500/30 bg-rose-500/[0.08]",
    highlight: "border-primary/50 bg-primary/[0.09] shadow-glow-primary",
  };

  const iconBg = {
    default: "bg-muted text-foreground/85 border border-border",
    warning: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    danger: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
    highlight: "bg-primary/20 text-primary border border-primary/30",
  };

  return (
    <div
      className={cn(
        "relative rounded-2xl border p-5 shadow-card backdrop-blur-sm transition-all duration-200 flex flex-col justify-between overflow-hidden hover:translate-y-[-1px]",
        variantStyles[variant],
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
            {tooltip && (
              <span title={tooltip} className="cursor-help text-muted-foreground/60 hover:text-muted-foreground">
                <Info className="h-3 w-3" />
              </span>
            )}
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
            {value}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {icon && (
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg shrink-0", iconBg[variant])}>
              {icon}
            </div>
          )}
          {badge && (
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {badge}
            </span>
          )}
        </div>
      </div>

      {(subtext || trend) && (
        <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
          {subtext && <span className="truncate">{subtext}</span>}
          {trend && (
            <span
              className={cn(
                "font-semibold shrink-0 ml-auto",
                trend.isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              )}
            >
              {trend.value} {trend.label && <span className="font-normal text-muted-foreground">({trend.label})</span>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

