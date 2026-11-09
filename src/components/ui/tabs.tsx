"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface TabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (id: T) => void;
  className?: string;
  size?: "sm" | "default";
}

export function Tabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  className,
  size = "default",
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center rounded-xl bg-muted/60 p-1 text-muted-foreground border border-border/60",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative z-10 flex items-center gap-2 rounded-lg font-medium transition-colors select-none",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
              isActive ? "text-foreground font-semibold" : "hover:text-foreground/80"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="active-tab-indicator"
                className="absolute inset-0 z-[-1] rounded-lg bg-card shadow-xs border border-border/80"
                transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
              />
            )}
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                  isActive
                    ? "bg-primary/10 text-primary font-bold"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

