"use client";

import * as React from "react";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

interface AnimatedTextProps {
  text: string;
  className?: string;
  tag?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
  delay?: number;
  duration?: number;
  stagger?: number;
}

export function AnimatedText({
  text,
  className = "",
  tag: Tag = "h1",
  delay = 0,
  duration = 0.5,
  stagger = 0.02,
}: AnimatedTextProps) {
  const containerRef = useRef<HTMLElement | null>(null);

  useGSAP(
    () => {
      // Respect accessibility preference
      if (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return;
      }

      if (!containerRef.current) return;

      const words = containerRef.current.querySelectorAll(".anim-word");
      if (words.length === 0) return;

      gsap.fromTo(
        words,
        {
          opacity: 0,
          y: 10,
        },
        {
          opacity: 1,
          y: 0,
          duration,
          delay,
          stagger,
          ease: "power2.out",
          clearProps: "transform,opacity",
        }
      );
    },
    { scope: containerRef, dependencies: [text, delay, duration, stagger] }
  );

  const words = text.split(" ");

  return (
    <Tag
      ref={containerRef as any}
      className={`inline-block ${className}`}
      aria-label={text}
    >
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className="anim-word inline-block mr-[0.28em] will-change-transform"
        >
          {word}
        </span>
      ))}
    </Tag>
  );
}

