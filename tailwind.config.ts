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
        // Warm, Claude-flavored palette for the chat UI.
        brand: {
          bg: "#17150f", // warm near-black
          surface: "#221f18",
          surface2: "#2b271f",
          border: "#37322a",
          text: "#efe9df",
          muted: "#a39a8b",
          faint: "#6f6656",
          accent: "#d97757", // Anthropic coral
          accentHover: "#e08d70",
          accentSoft: "#3a2820",
          online: "#7dd3a8",
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
