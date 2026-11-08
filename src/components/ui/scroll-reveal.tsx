"use client";

import React, { useEffect, useRef, useState } from "react";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  yOffset?: number;
  stagger?: number;
}

export function ScrollReveal({
  children,
  className = "",
  delay = 0,
  duration = 0.55,
  yOffset = 20,
}: ScrollRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 1. Accessibility: prefers-reduced-motion reveals immediately with no transform or opacity transitions
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const raf = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(raf);
    }

    const node = containerRef.current;
    if (!node) return;

    // 2. Check if already near or within viewport on initial render / page load
    const checkInitialPosition = () => {
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.92) {
        setIsVisible(true);
        return true;
      }
      return false;
    };

    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (!cancelled) {
        checkInitialPosition();
      }
    });

    // 3. Resilient IntersectionObserver with generous rootMargin
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.boundingClientRect.top < window.innerHeight * 0.95) {
            setIsVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      {
        threshold: [0, 0.05, 0.1],
        rootMargin: "0px 0px -20px 0px",
      }
    );

    observer.observe(node);

    // 4. Scroll event fallback ensuring Lenis smooth scroll or fast flick always reveals
    const handleScroll = () => {
      if (checkInitialPosition()) {
        window.removeEventListener("scroll", handleScroll);
        observer.disconnect();
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`scroll-reveal-container ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "none" : `translateY(${yOffset}px)`,
        transition: `opacity ${duration}s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform ${duration}s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
        willChange: isVisible ? "auto" : "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
