import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        "jakarta": ["Plus Jakarta Sans", "var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        shimmer: {
          "100%": {
            transform: "translateX(100%)",
          },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-left": {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "count-up": {
          "0%": { opacity: "0", transform: "translateY(8px) scale(0.95)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        shimmer: "shimmer 2.5s infinite",
        "fade-up": "fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both",
        "fade-up-delay-1": "fade-up 0.4s 0.08s cubic-bezier(0.16,1,0.3,1) both",
        "fade-up-delay-2": "fade-up 0.4s 0.16s cubic-bezier(0.16,1,0.3,1) both",
        "fade-up-delay-3": "fade-up 0.4s 0.24s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 0.35s ease both",
        "scale-in": "scale-in 0.35s cubic-bezier(0.16,1,0.3,1) both",
        "slide-left": "slide-left 0.35s cubic-bezier(0.16,1,0.3,1) both",
        "count-up": "count-up 0.5s 0.1s cubic-bezier(0.16,1,0.3,1) both",
      },
      boxShadow: {
        "glow-primary": "0 0 24px rgba(37,99,235,0.18)",
        "glow-primary-lg": "0 0 40px rgba(37,99,235,0.22)",
        "lift": "0 8px 24px rgba(15,23,42,0.10), 0 2px 8px rgba(15,23,42,0.06)",
        "card": "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
        "card-hover": "0 6px 16px rgba(15,23,42,0.09), 0 2px 6px rgba(15,23,42,0.05)",
      },
    },
  },
  plugins: [],
};
export default config;
