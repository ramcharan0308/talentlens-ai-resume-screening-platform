"use client";

import * as React from "react";
import Lenis from "lenis";

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    // Respect user's accessibility preference
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.0,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5,
      // Prevent lenis on elements with data-lenis-prevent (e.g. modals, overflow tables)
      prevent: (node) => {
        return (
          node.hasAttribute("data-lenis-prevent") ||
          node.closest("[data-lenis-prevent]") !== null ||
          node.tagName === "TEXTAREA" ||
          node.tagName === "SELECT"
        );
      },
    });

    // Dispatch native scroll events on Lenis animation so any listener (ScrollTrigger, IntersectionObserver fallbacks) receives smooth updates
    lenis.on("scroll", () => {
      window.dispatchEvent(new Event("scroll"));
    });

    let animationFrameId: number;

    function raf(time: number) {
      lenis.raf(time);
      animationFrameId = requestAnimationFrame(raf);
    }

    animationFrameId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(animationFrameId);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}

