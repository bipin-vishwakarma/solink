"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { CodeSnippet } from "./CodeSnippet";
import { fileNameFor } from "@/lib/disguise";

const FAKE_TREE = [
  { name: "src", depth: 0, folder: true },
  { name: "crypto.ts", depth: 1 },
  { name: "session.ts", depth: 1 },
  { name: "router.ts", depth: 1 },
  { name: "index.ts", depth: 1, active: true },
  { name: "components", depth: 0, folder: true },
  { name: "App.tsx", depth: 1 },
  { name: "package.json", depth: 0 },
  { name: "tsconfig.json", depth: 0 },
];

const FAKE_TERMINAL = [
  "$ npm run build",
  "> solink@0.1.0 build",
  "> next build",
  "",
  "  ▲ Next.js 14.2.5",
  "   Creating an optimized production build ...",
  " ✓ Compiled successfully",
  " ✓ Linting and checking validity of types",
  " ✓ Collecting page data",
];

export function BossModeIDE({
  messages,
  peerName,
  onSend,
  onExit,
}: {
  messages: ChatMessage[];
  peerName: string;
  onSend: (text: string) => void;
  onExit: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [showTerminal, setShowTerminal] = useState(true);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    editorRef.current?.scrollTo({ top: editorRef.current.scrollHeight });
  }, [messages.length]);

  function submit() {
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft("");
  }

  const tabFile = messages.length ? fileNameFor(messages[messages.length - 1].id) : "index.ts";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ide-bg font-mono text-ide-text">
      {/* menu bar */}
      <div className="flex items-center justify-between border-b border-ide-border bg-ide-panel px-3 py-1 text-xs text-[#cccccc]">
        <div className="flex gap-4">
          {["File", "Edit", "Selection", "View", "Go", "Run", "Terminal", "Help"].map((m) => (
            <span key={m} className="opacity-80 hover:opacity-100">
              {m}
            </span>
          ))}
        </div>
        <div className="opacity-70">index.ts — solink — Visual Studio Code</div>
        <button
          onClick={onExit}
          className="rounded px-2 py-[1px] text-[10px] text-ide-comment hover:bg-white/10"
          title="Exit disguise (Esc)"
        >
          exit ⎋
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* activity bar */}
        <div className="flex w-11 flex-col items-center gap-4 border-r border-ide-border bg-ide-activity py-3 text-[#858585]">
          {["📄", "🔍", "⑃", "▷", "⚙"].map((i, idx) => (
            <span key={idx} className={idx === 0 ? "text-white" : ""}>
              {i}
            </span>
          ))}
        </div>

        {/* file explorer */}
        <div className="hidden w-56 shrink-0 flex-col border-r border-ide-border bg-ide-panel text-[13px] sm:flex">
          <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-[#858585]">
            Explorer
          </div>
          <div className="px-2">
            {FAKE_TREE.map((f, i) => (
              <div
                key={i}
                className={`flex items-center gap-1 rounded px-2 py-[2px] ${
                  f.active ? "bg-white/10 text-white" : "text-[#cccccc]"
                }`}
                style={{ paddingLeft: 8 + f.depth * 14 }}
              >
                <span className="text-[#858585]">{f.folder ? "▸" : ""}</span>
                <span>{f.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* editor */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* tabs */}
          <div className="flex items-center border-b border-ide-border bg-ide-panel text-[13px]">
            <div className="flex items-center gap-2 border-r border-ide-border bg-ide-bg px-4 py-2 text-white">
              <span className="text-ide-kw">{"</>"}</span> index.ts
              <span className="ml-2 text-[#858585]">●</span>
            </div>
            <div className="px-4 py-2 text-[#858585]">{tabFile}</div>
          </div>

          {/* code area (messages as code) */}
          <div ref={editorRef} className="min-h-0 flex-1 overflow-auto py-2">
            <div className="mb-1 px-3 pl-12 text-[13px] leading-6 text-ide-comment">
              {`// session: encrypted channel with ${peerName || "peer"} — ${messages.length} entries`}
            </div>
            {messages.map((m, i) => (
              <CodeSnippet
                key={m.id}
                id={m.id}
                text={m.text}
                mine={m.mine}
                lineNumber={i + 2}
              />
            ))}
            {/* editable "new line" that is really the chat input */}
            <div className="flex items-start gap-4 px-3 font-mono text-[13px] leading-6">
              <span className="w-8 shrink-0 text-right text-[#6e7681] tabular-nums">
                {messages.length + 2}
              </span>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                placeholder="// keep typing…"
                className="w-full bg-transparent text-ide-str placeholder:text-[#5a5a5a] caret-ide-accent outline-none"
              />
            </div>
          </div>

          {/* terminal panel */}
          {showTerminal && (
            <div className="h-40 shrink-0 border-t border-ide-border bg-ide-bg">
              <div className="flex items-center gap-4 border-b border-ide-border px-3 py-1 text-[11px] uppercase text-[#858585]">
                <span className="text-white">Terminal</span>
                <span>Problems</span>
                <span>Output</span>
                <button
                  className="ml-auto hover:text-white"
                  onClick={() => setShowTerminal(false)}
                >
                  ✕
                </button>
              </div>
              <div className="overflow-auto px-3 py-1 text-[12px] leading-5 text-[#cccccc]">
                {FAKE_TERMINAL.map((l, i) => (
                  <div key={i} className={l.startsWith(" ✓") ? "text-ide-num" : ""}>
                    {l || " "}
                  </div>
                ))}
                <div className="cursor-blink text-ide-num">$ </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* status bar */}
      <div className="flex items-center justify-between bg-ide-accent px-3 py-[2px] text-[11px] text-white">
        <div className="flex gap-3">
          <span>⎇ main</span>
          <span>✓ Prettier</span>
          <span>0 ⚠ 0 ✕</span>
        </div>
        <div className="flex gap-3">
          <span>Ln {messages.length + 2}, Col {draft.length + 1}</span>
          <span>UTF-8</span>
          <span>TypeScript</span>
          <span className="opacity-80">Esc to exit</span>
        </div>
      </div>
    </div>
  );
}
