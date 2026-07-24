"use client";

import { useMemo, useState } from "react";
import { codeFor, type Token, type TokenKind } from "@/lib/disguise";

const COLOR: Record<TokenKind, string> = {
  kw: "text-ide-kw",
  fn: "text-ide-fn",
  str: "text-ide-str",
  num: "text-ide-num",
  comment: "text-ide-comment italic",
  type: "text-ide-type",
  var: "text-ide-var",
  punct: "text-ide-punct",
  plain: "text-ide-text",
};

export function TokenLine({ tokens }: { tokens: Token[] }) {
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} className={COLOR[t.kind]}>
          {t.value}
        </span>
      ))}
    </>
  );
}

/**
 * Renders a message as a line of code. Click/tap toggles between the code mask
 * and the real (decrypted) English text.
 */
export function CodeSnippet({
  id,
  text,
  lineNumber,
  mine,
}: {
  id: string;
  text: string;
  lineNumber: number;
  mine: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const tokens = useMemo(() => codeFor(id), [id]);

  return (
    <div
      className="group flex items-start gap-4 px-3 py-[1px] font-mono text-[13px] leading-6 hover:bg-white/[0.03] cursor-pointer select-none"
      onClick={() => setRevealed((r) => !r)}
      title={revealed ? "tap to hide" : "tap to reveal"}
    >
      <span className="w-8 shrink-0 text-right text-[#6e7681] tabular-nums">
        {lineNumber}
      </span>
      <code className="whitespace-pre-wrap break-words">
        {revealed ? (
          <span className="just-revealed rounded bg-ide-accent/20 px-1 text-ide-text">
            {mine ? "» " : ""}
            {text}
          </span>
        ) : (
          <TokenLine tokens={tokens} />
        )}
      </code>
    </div>
  );
}
