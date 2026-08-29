// Sticker dataset and storage helpers for Solink WhatsApp-style stickers.
// Everything is self-contained and operates purely in browser memory/storage.

export interface Sticker {
  id: string;
  name: string;
  dataUrl: string; // SVG or WebP/PNG data URI
}

export interface StickerPack {
  id: string;
  name: string;
  icon: string;
  stickers: Sticker[];
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

// ---------------------------------------------------------------------------
// Pack 1: Doge & WeChat Iconic Reactions
// ---------------------------------------------------------------------------
const DOGE_PACK: Sticker[] = [
  {
    id: "doge-classic",
    name: "Classic Doge",
    dataUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="#e5b358" stroke="#b8832a" stroke-width="4"/>
        <path d="M22 36 L12 12 L38 24 Z" fill="#b8832a"/>
        <path d="M98 36 L108 12 L82 24 Z" fill="#b8832a"/>
        <ellipse cx="60" cy="72" rx="28" ry="22" fill="#fff5d9"/>
        <ellipse cx="44" cy="50" rx="7" ry="9" fill="#2d2212"/>
        <ellipse cx="76" cy="50" rx="7" ry="9" fill="#2d2212"/>
        <circle cx="42" cy="48" r="2.5" fill="#fff"/>
        <circle cx="74" cy="48" r="2.5" fill="#fff"/>
        <path d="M40 38 Q46 34 52 38" stroke="#7a5518" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M68 38 Q74 34 80 38" stroke="#7a5518" stroke-width="3" fill="none" stroke-linecap="round"/>
        <ellipse cx="60" cy="68" rx="8" ry="6" fill="#1f160b"/>
        <path d="M52 75 Q60 82 68 75" stroke="#1f160b" stroke-width="3" fill="none" stroke-linecap="round"/>
        <ellipse cx="36" cy="66" rx="6" ry="3" fill="#ffb4a2" opacity="0.7"/>
        <ellipse cx="84" cy="66" rx="6" ry="3" fill="#ffb4a2" opacity="0.7"/>
      </svg>
    `),
  },
  {
    id: "doge-cool",
    name: "Cool Doge",
    dataUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="#e5b358" stroke="#b8832a" stroke-width="4"/>
        <path d="M22 36 L12 12 L38 24 Z" fill="#b8832a"/>
        <path d="M98 36 L108 12 L82 24 Z" fill="#b8832a"/>
        <ellipse cx="60" cy="72" rx="28" ry="22" fill="#fff5d9"/>
        <ellipse cx="60" cy="68" rx="8" ry="6" fill="#1f160b"/>
        <path d="M52 75 Q60 84 68 75" stroke="#1f160b" stroke-width="3" fill="none" stroke-linecap="round"/>
        <!-- Sunglasses -->
        <polygon points="26,42 54,42 50,58 32,58" fill="#111" stroke="#333" stroke-width="2"/>
        <polygon points="66,42 94,42 88,58 70,58" fill="#111" stroke="#333" stroke-width="2"/>
        <line x1="54" y1="46" x2="66" y2="46" stroke="#111" stroke-width="3"/>
        <line x1="30" y1="46" x2="48" y2="54" stroke="#fff" stroke-width="1.5" opacity="0.6"/>
        <line x1="70" y1="46" x2="88" y2="54" stroke="#fff" stroke-width="1.5" opacity="0.6"/>
      </svg>
    `),
  },
  {
    id: "wechat-facepalm",
    name: "Facepalm",
    dataUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="#ffcc4d" stroke="#e09915" stroke-width="4"/>
        <!-- Eyes closed in agony -->
        <path d="M28 50 Q36 44 44 50" stroke="#664500" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <path d="M60 48 Q68 54 76 48" stroke="#664500" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <!-- Mouth wry smile -->
        <path d="M38 78 Q55 90 75 76" stroke="#664500" stroke-width="4" fill="none" stroke-linecap="round"/>
        <!-- Slanted eyebrows -->
        <path d="M26 40 L44 46" stroke="#664500" stroke-width="3" stroke-linecap="round"/>
        <path d="M62 44 L78 38" stroke="#664500" stroke-width="3" stroke-linecap="round"/>
        <!-- Tear of despair -->
        <path d="M84 56 Q88 64 84 70 Q80 64 84 56 Z" fill="#5dade2"/>
        <!-- Slapping hand over left brow -->
        <path d="M72 18 C80 18 95 32 95 48 C95 62 82 72 74 65 C68 60 70 42 70 32 Z" fill="#f5b041" stroke="#d68910" stroke-width="3"/>
        <path d="M80 32 L92 38" stroke="#b9770e" stroke-width="2" stroke-linecap="round"/>
        <path d="M78 42 L90 47" stroke="#b9770e" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `),
  },
  {
    id: "wechat-smart",
    name: "Smart / Galaxy Brain",
    dataUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <circle cx="56" cy="60" r="50" fill="#ffcc4d" stroke="#e09915" stroke-width="4"/>
        <!-- Smug eyes -->
        <path d="M30 48 Q38 42 46 48" stroke="#664500" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M64 48 Q72 42 80 48" stroke="#664500" stroke-width="3" fill="none" stroke-linecap="round"/>
        <!-- Smug smirk -->
        <path d="M40 76 Q60 84 76 68" stroke="#664500" stroke-width="4" fill="none" stroke-linecap="round"/>
        <!-- Hand tapping temple -->
        <path d="M85 75 L85 45 Q85 38 92 38 Q99 38 99 45 L99 68" stroke="#d68910" stroke-width="4" fill="#f5b041" stroke-linecap="round"/>
        <!-- Mind sparkles -->
        <circle cx="95" cy="25" r="3" fill="#f39c12"/>
        <circle cx="108" cy="35" r="2" fill="#f39c12"/>
        <circle cx="82" cy="20" r="2" fill="#f39c12"/>
      </svg>
    `),
  },
  {
    id: "wechat-hey",
    name: "Hey / Kung Fu",
    dataUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="52" fill="#ffcc4d" stroke="#e09915" stroke-width="4"/>
        <!-- Determined eyebrows -->
        <path d="M30 42 L48 48" stroke="#664500" stroke-width="4" stroke-linecap="round"/>
        <path d="M72 48 L90 42" stroke="#664500" stroke-width="4" stroke-linecap="round"/>
        <!-- Confident eyes -->
        <ellipse cx="40" cy="54" rx="5" ry="7" fill="#664500"/>
        <ellipse cx="80" cy="54" rx="5" ry="7" fill="#664500"/>
        <circle cx="42" cy="52" r="2" fill="#fff"/>
        <circle cx="82" cy="52" r="2" fill="#fff"/>
        <!-- Open confident grin -->
        <path d="M44 72 Q60 88 76 72 Z" fill="#c0392b" stroke="#664500" stroke-width="3"/>
        <!-- Red headband -->
        <path d="M12 36 Q60 20 108 36 L106 28 Q60 14 14 28 Z" fill="#e74c3c"/>
      </svg>
    `),
  },
  {
    id: "wechat-redpacket",
    name: "Red Packet / Lucky",
    dataUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <rect x="25" y="15" width="70" height="90" rx="10" fill="#e74c3c" stroke="#c0392b" stroke-width="3"/>
        <path d="M25 15 Q60 55 95 15" fill="#c0392b"/>
        <circle cx="60" cy="50" r="16" fill="#f1c40f" stroke="#d4ac0d" stroke-width="2"/>
        <text x="60" y="56" font-size="16" font-weight="bold" fill="#c0392b" text-anchor="middle" font-family="sans-serif">開</text>
        <circle cx="35" cy="90" r="2" fill="#f9e79f"/>
        <circle cx="85" cy="85" r="2" fill="#f9e79f"/>
      </svg>
    `),
  },
];

// ---------------------------------------------------------------------------
// Pack 2: Cute Cats & Pets
// ---------------------------------------------------------------------------
const CATS_PACK: Sticker[] = [
  {
    id: "cat-popcat",
    name: "Popcat",
    dataUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <ellipse cx="60" cy="66" rx="46" ry="40" fill="#f5f0ea" stroke="#d1c7bc" stroke-width="3"/>
        <!-- Ears -->
        <polygon points="24,42 16,16 46,28" fill="#f5f0ea" stroke="#d1c7bc" stroke-width="3"/>
        <polygon points="96,42 104,16 74,28" fill="#f5f0ea" stroke="#d1c7bc" stroke-width="3"/>
        <polygon points="26,38 20,22 42,30" fill="#f1948a"/>
        <polygon points="94,38 100,22 78,30" fill="#f1948a"/>
        <!-- Big black eyes -->
        <circle cx="40" cy="52" r="9" fill="#1c1917"/>
        <circle cx="80" cy="52" r="9" fill="#1c1917"/>
        <circle cx="37" cy="49" r="3" fill="#fff"/>
        <circle cx="77" cy="49" r="3" fill="#fff"/>
        <!-- Huge O mouth -->
        <ellipse cx="60" cy="80" rx="20" ry="18" fill="#800000" stroke="#4a0000" stroke-width="3"/>
        <ellipse cx="60" cy="86" rx="12" ry="8" fill="#e74c3c"/>
      </svg>
    `),
  },
  {
    id: "cat-thumbsup",
    name: "Thumbs Up Cat",
    dataUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <ellipse cx="54" cy="62" rx="44" ry="38" fill="#fdfefe" stroke="#ccd1d1" stroke-width="3"/>
        <polygon points="20,40 12,14 42,26" fill="#fdfefe" stroke="#ccd1d1" stroke-width="3"/>
        <polygon points="88,40 96,14 66,26" fill="#fdfefe" stroke="#ccd1d1" stroke-width="3"/>
        <polygon points="22,36 16,20 38,28" fill="#f5b7b1"/>
        <polygon points="86,36 92,20 70,28" fill="#f5b7b1"/>
        <!-- Smug smile -->
        <path d="M34 52 Q42 46 50 52" stroke="#2c3e50" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M58 52 Q66 46 74 52" stroke="#2c3e50" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M46 64 Q54 72 62 64" stroke="#2c3e50" stroke-width="3" fill="none" stroke-linecap="round"/>
        <!-- Paw thumbs up -->
        <ellipse cx="94" cy="72" rx="14" ry="12" fill="#fff" stroke="#ccd1d1" stroke-width="2.5"/>
        <path d="M92 64 L92 48 Q95 44 98 48 L98 64" fill="#fff" stroke="#ccd1d1" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M92 48 Q95 44 98 48" fill="#f5b7b1"/>
      </svg>
    `),
  },
  {
    id: "cat-crying",
    name: "Crying Meme Cat",
    dataUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <ellipse cx="60" cy="64" rx="46" ry="40" fill="#fef9e7" stroke="#f9e79f" stroke-width="3"/>
        <polygon points="22,40 12,16 42,26" fill="#fef9e7" stroke="#f9e79f" stroke-width="3"/>
        <polygon points="98,40 108,16 78,26" fill="#fef9e7" stroke="#f9e79f" stroke-width="3"/>
        <!-- Glassy, ultra watery crying eyes -->
        <ellipse cx="40" cy="54" rx="13" ry="11" fill="#3498db"/>
        <ellipse cx="80" cy="54" rx="13" ry="11" fill="#3498db"/>
        <circle cx="36" cy="50" r="5" fill="#fff"/>
        <circle cx="76" cy="50" r="5" fill="#fff"/>
        <circle cx="44" cy="58" r="3" fill="#aed6f1"/>
        <circle cx="84" cy="58" r="3" fill="#aed6f1"/>
        <!-- Tears overflowing -->
        <path d="M38 65 Q40 82 34 94" stroke="#5dade2" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M82 65 Q80 82 86 94" stroke="#5dade2" stroke-width="4" fill="none" stroke-linecap="round"/>
        <!-- Polite trembling mouth -->
        <path d="M50 78 Q60 72 70 78" stroke="#7d6608" stroke-width="3" fill="none" stroke-linecap="round"/>
      </svg>
    `),
  },
  {
    id: "cat-heart",
    name: "Heart Cat",
    dataUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <ellipse cx="60" cy="64" rx="46" ry="40" fill="#fdfefe" stroke="#ccd1d1" stroke-width="3"/>
        <polygon points="22,40 14,16 44,26" fill="#fdfefe" stroke="#ccd1d1" stroke-width="3"/>
        <polygon points="98,40 106,16 76,26" fill="#fdfefe" stroke="#ccd1d1" stroke-width="3"/>
        <!-- Heart eyes -->
        <path d="M32 50 A 5 5 0 0 1 42 50 Q 42 58 37 63 Q 32 58 32 50 Z" fill="#e74c3c"/>
        <path d="M72 50 A 5 5 0 0 1 82 50 Q 82 58 77 63 Q 72 58 72 50 Z" fill="#e74c3c"/>
        <!-- Cute :3 mouth -->
        <path d="M52 70 Q56 74 60 70 Q64 74 68 70" stroke="#2c3e50" stroke-width="3" fill="none" stroke-linecap="round"/>
        <ellipse cx="30" cy="66" rx="6" ry="3" fill="#f5b7b1" opacity="0.7"/>
        <ellipse cx="90" cy="66" rx="6" ry="3" fill="#f5b7b1" opacity="0.7"/>
      </svg>
    `),
  },
];

// ---------------------------------------------------------------------------
// Pack 3: Classic Memes & Reactions
// ---------------------------------------------------------------------------
const MEMES_PACK: Sticker[] = [
  {
    id: "meme-thisisfine",
    name: "This Is Fine",
    dataUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <!-- Flames in background -->
        <path d="M10 110 Q20 40 40 70 Q50 20 70 60 Q85 30 105 70 Q115 50 115 110 Z" fill="#e74c3c"/>
        <path d="M20 110 Q30 60 45 80 Q60 40 75 80 Q90 50 105 110 Z" fill="#f39c12"/>
        <path d="M35 110 Q45 75 55 90 Q65 65 75 90 Q85 80 95 110 Z" fill="#f1c40f"/>
        <!-- Dog head with hat -->
        <ellipse cx="60" cy="72" rx="24" ry="20" fill="#d4ac0d" stroke="#7d6608" stroke-width="2.5"/>
        <ellipse cx="50" cy="68" rx="4" ry="5" fill="#1c1917"/>
        <ellipse cx="70" cy="68" rx="4" ry="5" fill="#1c1917"/>
        <path d="M54 80 Q60 84 66 80" stroke="#7d6608" stroke-width="2" fill="none"/>
        <!-- Hat -->
        <polygon points="46,55 74,55 66,35 54,35" fill="#2c3e50"/>
        <rect x="42" y="53" width="36" height="4" rx="2" fill="#1a252f"/>
        <!-- Coffee cup -->
        <rect x="75" y="80" width="16" height="18" rx="3" fill="#ecf0f1" stroke="#bdc3c7" stroke-width="2"/>
        <path d="M91 84 Q97 89 91 94" stroke="#bdc3c7" stroke-width="2" fill="none"/>
      </svg>
    `),
  },
  {
    id: "meme-gigachad",
    name: "Gigachad",
    dataUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <rect width="120" height="120" rx="20" fill="#1e1e24"/>
        <!-- Chiseled jaw profile -->
        <path d="M35 30 Q55 22 75 28 Q88 34 85 52 L88 66 L78 88 L58 102 L44 94 L42 75 Z" fill="#8d99ae" stroke="#edf2f4" stroke-width="2.5"/>
        <!-- Sharp jawline shadow -->
        <path d="M58 102 L78 88 L88 66" stroke="#2b2d42" stroke-width="3" fill="none"/>
        <!-- High cheekbone & eye -->
        <path d="M52 46 L68 44" stroke="#2b2d42" stroke-width="3" stroke-linecap="round"/>
        <path d="M54 54 L66 52" stroke="#edf2f4" stroke-width="2" stroke-linecap="round"/>
        <path d="M50 74 L68 70" stroke="#2b2d42" stroke-width="3" stroke-linecap="round"/>
        <!-- Beard -->
        <path d="M44 80 Q60 98 76 86 L80 72 Q72 82 54 82 Z" fill="#2b2d42"/>
      </svg>
    `),
  },
  {
    id: "meme-mindblown",
    name: "Mind Blown",
    dataUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <!-- Cosmic explosion -->
        <circle cx="60" cy="35" r="26" fill="#8e44ad" opacity="0.8"/>
        <circle cx="60" cy="35" r="18" fill="#e74c3c" opacity="0.8"/>
        <circle cx="60" cy="35" r="10" fill="#f1c40f"/>
        <!-- Cosmic rays -->
        <line x1="60" y1="8" x2="60" y2="2" stroke="#f39c12" stroke-width="3" stroke-linecap="round"/>
        <line x1="85" y1="20" x2="94" y2="14" stroke="#e67e22" stroke-width="3" stroke-linecap="round"/>
        <line x1="35" y1="20" x2="26" y2="14" stroke="#e67e22" stroke-width="3" stroke-linecap="round"/>
        <!-- Shocked face -->
        <ellipse cx="60" cy="74" rx="40" ry="34" fill="#ffcc4d" stroke="#e09915" stroke-width="3"/>
        <circle cx="45" cy="68" r="8" fill="#fff" stroke="#664500" stroke-width="2"/>
        <circle cx="75" cy="68" r="8" fill="#fff" stroke="#664500" stroke-width="2"/>
        <circle cx="45" cy="68" r="3.5" fill="#664500"/>
        <circle cx="75" cy="68" r="3.5" fill="#664500"/>
        <!-- O mouth -->
        <ellipse cx="60" cy="90" rx="10" ry="12" fill="#78281f"/>
      </svg>
    `),
  },
  {
    id: "meme-100",
    name: "100 Lit",
    dataUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <text x="60" y="70" font-size="52" font-weight="900" fill="#e74c3c" text-anchor="middle" font-family="Impact, Arial Black, sans-serif" letter-spacing="-2">100</text>
        <line x1="20" y1="84" x2="100" y2="84" stroke="#e74c3c" stroke-width="6" stroke-linecap="round"/>
        <line x1="24" y1="94" x2="96" y2="94" stroke="#e74c3c" stroke-width="6" stroke-linecap="round"/>
        <!-- Fire accents -->
        <path d="M30 32 Q40 10 46 26 Q54 15 52 32 Z" fill="#f39c12"/>
        <path d="M70 30 Q78 12 84 25 Q92 18 88 32 Z" fill="#f1c40f"/>
      </svg>
    `),
  },
];

export const BUILTIN_STICKER_PACKS: StickerPack[] = [
  {
    id: "doge",
    name: "Doge & WeChat",
    icon: "🐶",
    stickers: DOGE_PACK,
  },
  {
    id: "cats",
    name: "Cute Cats",
    icon: "🐱",
    stickers: CATS_PACK,
  },
  {
    id: "memes",
    name: "Memes",
    icon: "🔥",
    stickers: MEMES_PACK,
  },
];

// Local storage key for user-saved / custom stickers
const STORAGE_KEY = "solink_user_stickers";

export function getCustomStickers(): Sticker[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomSticker(sticker: Sticker): Sticker[] {
  if (typeof window === "undefined") return [];
  try {
    const current = getCustomStickers();
    const updated = [sticker, ...current.filter((s) => s.id !== sticker.id)].slice(0, 48); // max 48 stickers
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function removeCustomSticker(id: string): Sticker[] {
  if (typeof window === "undefined") return [];
  try {
    const current = getCustomStickers();
    const updated = current.filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

/**
 * Converts any sticker data URL (SVG or WebP/PNG) into a browser File object
 * ready for the standard Solink sendFile / sendAttachment pipeline.
 */
export async function stickerToFile(sticker: Sticker): Promise<File> {
  const res = await fetch(sticker.dataUrl);
  const blob = await res.blob();
  const mime = blob.type || "image/webp";
  const ext = mime.includes("svg") ? "svg" : mime.includes("png") ? "png" : "webp";
  return new File([blob], `sticker-${sticker.id}.sticker.${ext}`, { type: mime });
}
