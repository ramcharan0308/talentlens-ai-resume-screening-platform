"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";

interface VantaTalentNetworkProps {
  className?: string;
  children?: React.ReactNode;
}

const emptySubscribe = () => () => {};
function useMounted() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function VantaTalentNetwork({
  className = "",
  children,
}: VantaTalentNetworkProps) {
  const vantaRef = useRef<HTMLDivElement>(null);
  const vantaEffect = useRef<any>(null);
  const mounted = useMounted();
  const [hasWebGL, setHasWebGL] = useState(true);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let isCancelled = false;

    async function initVanta() {
      try {
        const THREE = await import("three");
        (window as any).THREE = THREE;
        const NET = (await import("vanta/dist/vanta.net.min")).default;

        if (isCancelled || !vantaRef.current) return;

        const isDark = document.documentElement.classList.contains("dark");

        vantaEffect.current = NET({
          el: vantaRef.current,
          THREE: THREE,
          mouseControls: true,
          touchControls: false,
          gyroControls: false,
          minHeight: 200.0,
          minWidth: 200.0,
          scale: 1.0,
          scaleMobile: 1.0,
          color: 0x6366f1, // Electric Cobalt nodes
          backgroundColor: 0x07090e, // Deep Obsidian Slate
          points: 10.0,
          maxDistance: 19.0,
          spacing: 16.0,
          showDots: true,
        });
      } catch (err) {
        console.warn("Vanta.js WebGL initialization skipped:", err);
        setHasWebGL(false);
      }
    }

    initVanta();

    return () => {
      isCancelled = true;
      if (vantaEffect.current) {
        try {
          vantaEffect.current.destroy();
        } catch {
          // cleanup safeguard
        }
        vantaEffect.current = null;
      }
    };
  }, []);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* 3D WebGL Canvas Layer */}
      <div
        ref={vantaRef}
        className="absolute inset-0 z-0 transition-opacity duration-700"
        style={{ opacity: mounted && hasWebGL ? 1 : 0 }}
        aria-hidden="true"
      />

      {/* Subtle Ambient Lighting & Text Scrim (ensures crisp typography while preserving 3D depth) */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none bg-gradient-to-r from-background via-background/65 to-transparent"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 z-[1] pointer-events-none bg-gradient-to-t from-background via-transparent to-background/40"
        aria-hidden="true"
      />

      {/* Static Fallback Mesh (if WebGL fails or reduced motion is active) */}
      {(!mounted || !hasWebGL) && (
        <div
          className="absolute inset-0 z-0 subtle-grid opacity-50 pointer-events-none"
          aria-hidden="true"
        />
      )}

      {/* Foreground Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
