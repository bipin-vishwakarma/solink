"use client";

import { useId } from "react";

/**
 * LogoMark — the Solink icon mark: a coral-gradient chat bubble
 * enclosing a `</>` code glyph. Renders as a self-contained inline SVG.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  const gid = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Solink"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d97757" />
          <stop offset="1" stopColor="#b5533a" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#${gid})`} />
      {/* Chat bubble: rounded body + tail */}
      <path
        fill="#ffffff"
        d="M168 108 h176 a76 76 0 0 1 76 76 v104 a76 76 0 0 1 -76 76 h-92 l-70 62 a10 10 0 0 1 -16.5 -7.7 l0 -54.3 a76 76 0 0 1 -49.5 -76 v-104 a76 76 0 0 1 76 -76 z"
      />
      {/* Code brackets </> inside the bubble */}
      <g
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth={26}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="212,186 168,236 212,286" />
        <polyline points="300,186 344,236 300,286" />
        <line x1="272" y1="176" x2="240" y2="296" />
      </g>
    </svg>
  );
}

/**
 * LogoWordmark — the mark followed by the "Solink" word in cream,
 * for use in onboarding screens and headers.
 */
export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
    >
      <LogoMark size={32} />
      <span
        style={{
          color: "#efe9df",
          fontWeight: 600,
          fontSize: 22,
          letterSpacing: "-0.01em",
          lineHeight: 1,
        }}
      >
        Solink
      </span>
    </span>
  );
}
