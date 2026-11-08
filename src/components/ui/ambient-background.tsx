import * as React from "react";
import { cn } from "@/lib/utils";

interface AmbientBackgroundProps {
  className?: string;
  children?: React.ReactNode;
  showGlow?: boolean;
}

export function AmbientBackground({
  className,
  children,
  showGlow = false,
}: AmbientBackgroundProps) {
  return (
    <div className={cn("relative w-full overflow-hidden", className)}>
      {/* Subtle Grid Pattern */}
      <div
        className="pointer-events-none absolute inset-0 subtle-grid opacity-60 dark:opacity-40"
        aria-hidden="true"
      />

      {/* Optional Restrained Radial Glow */}
      {showGlow && (
        <div
          className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[720px] h-[360px] bg-gradient-to-b from-primary/10 via-primary/5 to-transparent blur-3xl opacity-75"
          aria-hidden="true"
        />
      )}

      {/* Children content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

