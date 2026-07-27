"use client";

// Deterministic avatar: a warm gradient + initials derived from the name.

const GRADIENTS = [
  ["#d97757", "#b5533a"],
  ["#c9915d", "#a06a3a"],
  ["#7aa2a0", "#4f7d7a"],
  ["#a88bbd", "#7c5f92"],
  ["#cf7a8f", "#a5546b"],
  ["#89a86b", "#5f7f45"],
  ["#c7a15b", "#9c7734"],
  ["#6f97c4", "#4b6f9a"],
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  size = 40,
  online,
  bot,
  src,
}: {
  name: string;
  size?: number;
  online?: boolean;
  bot?: boolean;
  src?: string | null;
}) {
  const [from, to] = GRADIENTS[hash(name || "?") % GRADIENTS.length];
  const dot = Math.max(9, Math.round(size * 0.28));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className="h-full w-full rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white/95 shadow-inner"
          style={{
            background: `linear-gradient(135deg, ${from}, ${to})`,
            fontSize: size * 0.4,
          }}
        >
          {bot ? "🤖" : initials(name || "?")}
        </div>
      )}
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-brand-surface bg-brand-online"
          style={{ width: dot, height: dot }}
        />
      )}
    </div>
  );
}
