import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["selector", "class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: ["dark"],
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
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        xl: "var(--radius-xl)",
        lg: "var(--radius-lg)",
        md: "var(--radius)",
        sm: "var(--radius-sm)",
      },
      fontSize: {
        display: ["28px", { lineHeight: "36px", letterSpacing: "-0.02em", fontWeight: "700" }],
        title: ["20px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "600" }],
        subtitle: ["16px", { lineHeight: "24px", letterSpacing: "-0.005em", fontWeight: "600" }],
        body: ["14px", { lineHeight: "22px", letterSpacing: "0", fontWeight: "400" }],
        caption: ["12px", { lineHeight: "18px", letterSpacing: "0", fontWeight: "500" }],
        micro: ["10px", { lineHeight: "14px", letterSpacing: "0.04em", fontWeight: "600" }],
      },
      transitionDuration: {
        fast: "100ms",
        normal: "200ms",
        slow: "300ms",
        slower: "500ms",
      },
      animation: {
        "pulse-once": "pulse-once 0.6s ease-in-out",
      },
      keyframes: {
        "pulse-once": {
          "0%, 100%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(245, 158, 11, 0)" },
          "50%": { transform: "scale(1.15)", boxShadow: "0 0 8px 2px rgba(245, 158, 11, 0.4)" },
        },
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
