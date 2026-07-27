import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        // Warm, Claude-flavored palette for the chat UI. Theme-aware via CSS vars
        // (defined in globals.css) so light/dark can be toggled.
        brand: {
          bg: "rgb(var(--brand-bg) / <alpha-value>)",
          surface: "rgb(var(--brand-surface) / <alpha-value>)",
          surface2: "rgb(var(--brand-surface2) / <alpha-value>)",
          border: "rgb(var(--brand-border) / <alpha-value>)",
          text: "rgb(var(--brand-text) / <alpha-value>)",
          muted: "rgb(var(--brand-muted) / <alpha-value>)",
          faint: "rgb(var(--brand-faint) / <alpha-value>)",
          accent: "rgb(var(--brand-accent) / <alpha-value>)",
          accentHover: "rgb(var(--brand-accentHover) / <alpha-value>)",
          accentSoft: "rgb(var(--brand-accentSoft) / <alpha-value>)",
          online: "rgb(var(--brand-online) / <alpha-value>)",
        },
        // VS Code "Dark+" inspired palette used by Boss Mode.
        ide: {
          bg: "#1e1e1e",
          panel: "#252526",
          activity: "#333333",
          border: "#2d2d2d",
          accent: "#007acc",
          text: "#d4d4d4",
          kw: "#569cd6",
          fn: "#dcdcaa",
          str: "#ce9178",
          num: "#b5cea8",
          comment: "#6a9955",
          type: "#4ec9b0",
          var: "#9cdcfe",
          punct: "#d4d4d4",
        },
      },
    },
  },
  plugins: [],
};

export default config;
