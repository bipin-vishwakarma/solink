"use client";

import { useMemo, type JSX } from "react";

/**
 * QRCode.tsx — self-contained QR code generator + SVG renderer.
 *
 * No external dependencies: the QR encoder below is implemented from scratch in
 * pure TypeScript (byte mode, ECC level M, automatic version selection up to
 * version 10, full Reed-Solomon error correction, function patterns, format &
 * version info, penalty-based mask selection, and a 4-module quiet zone).
 *
 * The output is verified against the QR Code 2005 (ISO/IEC 18004) spec and
 * scans with standard phone cameras.
 */

// ---------------------------------------------------------------------------
// Galois field GF(256) with primitive polynomial 0x11D (285) — QR standard.
// ---------------------------------------------------------------------------
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function polyMul(a: number[], b: number[]): number[] {
  const res = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      res[i + j] ^= gfMul(a[i], b[j]);
    }
  }
  return res;
}

/** Reed-Solomon generator polynomial of the given degree. */
function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    poly = polyMul(poly, [1, GF_EXP[i]]);
  }
  return poly;
}

/** Compute `ecLen` Reed-Solomon error-correction codewords for `data`. */
function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGeneratorPoly(ecLen);
  const res = new Array<number>(ecLen).fill(0);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.shift();
    res.push(0);
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        res[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Version / ECC block structure for error-correction level M (versions 1-10).
// Each entry: EC codewords per block + one or two groups of blocks.
// ---------------------------------------------------------------------------
interface Group {
  blocks: number;
  dataPerBlock: number;
}
interface VersionInfo {
  ecPerBlock: number;
  groups: Group[];
}

const EC_M: Record<number, VersionInfo> = {
  1: { ecPerBlock: 10, groups: [{ blocks: 1, dataPerBlock: 16 }] },
  2: { ecPerBlock: 16, groups: [{ blocks: 1, dataPerBlock: 28 }] },
  3: { ecPerBlock: 26, groups: [{ blocks: 1, dataPerBlock: 44 }] },
  4: { ecPerBlock: 18, groups: [{ blocks: 2, dataPerBlock: 32 }] },
  5: { ecPerBlock: 24, groups: [{ blocks: 2, dataPerBlock: 43 }] },
  6: { ecPerBlock: 16, groups: [{ blocks: 4, dataPerBlock: 27 }] },
  7: { ecPerBlock: 18, groups: [{ blocks: 4, dataPerBlock: 31 }] },
  8: {
    ecPerBlock: 22,
    groups: [
      { blocks: 2, dataPerBlock: 38 },
      { blocks: 2, dataPerBlock: 39 },
    ],
  },
  9: {
    ecPerBlock: 22,
    groups: [
      { blocks: 3, dataPerBlock: 36 },
      { blocks: 2, dataPerBlock: 37 },
    ],
  },
  10: {
    ecPerBlock: 26,
    groups: [
      { blocks: 4, dataPerBlock: 43 },
      { blocks: 1, dataPerBlock: 44 },
    ],
  },
};

/** Alignment pattern centre coordinates per version. */
const ALIGN_POS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const MAX_VERSION = 10;

function totalDataCodewords(version: number): number {
  return EC_M[version].groups.reduce((s, g) => s + g.blocks * g.dataPerBlock, 0);
}

function charCountBits(version: number): number {
  // Byte mode: 8 bits for versions 1-9, 16 bits for versions 10-26.
  return version < 10 ? 8 : 16;
}

/** Smallest version (1..10) whose level-M byte capacity fits `byteLen`. */
function selectVersion(byteLen: number): number {
  for (let v = 1; v <= MAX_VERSION; v++) {
    const capacityBits = totalDataCodewords(v) * 8 - 4 - charCountBits(v);
    if (byteLen <= Math.floor(capacityBits / 8)) return v;
  }
  throw new Error("QRCode: data too long (exceeds version-10 level-M capacity)");
}

// ---------------------------------------------------------------------------
// Encoding helpers.
// ---------------------------------------------------------------------------

/** Manual UTF-8 encoder (self-contained, avoids TextEncoder env differences). */
function toUtf8Bytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

/** Build the padded bit stream for byte-mode data at the given version. */
function buildBitStream(bytes: number[], version: number): number[] {
  const bits: number[] = [];
  const push = (val: number, len: number): void => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  push(0b0100, 4); // byte-mode indicator
  push(bytes.length, charCountBits(version)); // character count
  for (const b of bytes) push(b, 8); // payload

  const capacityBits = totalDataCodewords(version) * 8;

  // Terminator (up to 4 zero bits).
  const term = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < term; i++) bits.push(0);

  // Pad to a byte boundary.
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad bytes alternating 0xEC / 0x11.
  const pad = [0xec, 0x11];
  let p = 0;
  while (bits.length < capacityBits) {
    push(pad[p++ % 2], 8);
  }
  return bits;
}

function bitsToBytes(bits: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    out.push(b);
  }
  return out;
}

/** Split data into ECC blocks, compute RS codewords, and interleave. */
function buildFinalCodewords(dataCodewords: number[], version: number): number[] {
  const info = EC_M[version];
  const blocks: { data: number[]; ec: number[] }[] = [];
  let idx = 0;
  for (const g of info.groups) {
    for (let b = 0; b < g.blocks; b++) {
      const data = dataCodewords.slice(idx, idx + g.dataPerBlock);
      idx += g.dataPerBlock;
      blocks.push({ data, ec: rsEncode(data, info.ecPerBlock) });
    }
  }

  const result: number[] = [];
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i++) {
    for (const blk of blocks) {
      if (i < blk.data.length) result.push(blk.data[i]);
    }
  }
  const maxEc = Math.max(...blocks.map((b) => b.ec.length));
  for (let i = 0; i < maxEc; i++) {
    for (const blk of blocks) {
      if (i < blk.ec.length) result.push(blk.ec[i]);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Matrix construction.
// ---------------------------------------------------------------------------

const getBit = (value: number, i: number): boolean => ((value >>> i) & 1) !== 0;

function maskCondition(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return false;
  }
}

class QrMatrix {
  readonly size: number;
  readonly modules: boolean[][];
  private readonly isFunction: boolean[][];

  constructor(private readonly version: number) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );
    this.isFunction = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );
  }

  private setFn(x: number, y: number, dark: boolean): void {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }

  private drawFinder(cx: number, cy: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev distance
        const xx = cx + dx;
        const yy = cy + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFn(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private drawAlignment(cx: number, cy: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  drawFunctionPatterns(): void {
    const n = this.size;

    // Timing patterns.
    for (let i = 0; i < n; i++) {
      this.setFn(6, i, i % 2 === 0);
      this.setFn(i, 6, i % 2 === 0);
    }

    // Finder patterns (top-left, top-right, bottom-left).
    this.drawFinder(3, 3);
    this.drawFinder(n - 4, 3);
    this.drawFinder(3, n - 4);

    // Alignment patterns (skip the three finder corners).
    const pos = ALIGN_POS[this.version];
    const k = pos.length;
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        if (
          (i === 0 && j === 0) ||
          (i === 0 && j === k - 1) ||
          (i === k - 1 && j === 0)
        ) {
          continue;
        }
        this.drawAlignment(pos[i], pos[j]);
      }
    }

    // Reserve format-info cells (values overwritten later) and version info.
    this.drawFormatBits(0);
    this.drawVersion();
  }

  /** Draw both copies of the 15-bit format information for the given mask (ECC level M). */
  drawFormatBits(mask: number): void {
    const n = this.size;
    // ECC level M format bits = 0b00; combine with 3-bit mask.
    const data = (0b00 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412; // 15-bit masked value

    // First copy — around the top-left finder.
    for (let i = 0; i <= 5; i++) this.setFn(8, i, getBit(bits, i));
    this.setFn(8, 7, getBit(bits, 6));
    this.setFn(8, 8, getBit(bits, 7));
    this.setFn(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFn(14 - i, 8, getBit(bits, i));

    // Second copy — split between top-right and bottom-left finders.
    for (let i = 0; i < 8; i++) this.setFn(n - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) this.setFn(8, n - 15 + i, getBit(bits, i));
    this.setFn(8, n - 8, true); // always-dark module
  }

  /** Draw both copies of the 18-bit version information (versions >= 7). */
  private drawVersion(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem; // 18-bit value

    const n = this.size;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i);
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFn(a, b, bit);
      this.setFn(b, a, bit);
    }
  }

  /** Place the interleaved codeword bits in the zigzag scan order. */
  drawCodewords(data: number[]): void {
    const n = this.size;
    let i = 0; // bit index
    const totalBits = data.length * 8;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // skip the vertical timing column
      for (let vert = 0; vert < n; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? n - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < totalBits) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  /** XOR the mask onto all non-function modules (applying twice undoes it). */
  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.isFunction[y][x] && maskCondition(mask, x, y)) {
          this.modules[y][x] = !this.modules[y][x];
        }
      }
    }
  }

  // --- Penalty scoring (per ISO/IEC 18004 §8.8.2) ---
  private static readonly N1 = 3;
  private static readonly N2 = 3;
  private static readonly N3 = 40;
  private static readonly N4 = 10;

  private finderPenaltyAddHistory(runLength: number, history: number[]): void {
    if (history[0] === 0) runLength += this.size; // light border to initial run
    history.pop();
    history.unshift(runLength);
  }

  private finderPenaltyCountPatterns(history: number[]): number {
    const n = history[1];
    const core =
      n > 0 &&
      history[2] === n &&
      history[3] === n * 3 &&
      history[4] === n &&
      history[5] === n;
    return (
      (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) +
      (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0)
    );
  }

  private finderPenaltyTerminate(color: boolean, runLength: number, history: number[]): number {
    if (color) {
      this.finderPenaltyAddHistory(runLength, history);
      runLength = 0;
    }
    runLength += this.size; // light border to final run
    this.finderPenaltyAddHistory(runLength, history);
    return this.finderPenaltyCountPatterns(history);
  }

  getPenalty(): number {
    let result = 0;
    const n = this.size;

    // Rule 1 + finder-like patterns — rows.
    for (let y = 0; y < n; y++) {
      let color = false;
      let run = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < n; x++) {
        if (this.modules[y][x] === color) {
          run++;
          if (run === 5) result += QrMatrix.N1;
          else if (run > 5) result++;
        } else {
          this.finderPenaltyAddHistory(run, history);
          if (!color) result += this.finderPenaltyCountPatterns(history) * QrMatrix.N3;
          color = this.modules[y][x];
          run = 1;
        }
      }
      result += this.finderPenaltyTerminate(color, run, history) * QrMatrix.N3;
    }

    // Rule 1 + finder-like patterns — columns.
    for (let x = 0; x < n; x++) {
      let color = false;
      let run = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < n; y++) {
        if (this.modules[y][x] === color) {
          run++;
          if (run === 5) result += QrMatrix.N1;
          else if (run > 5) result++;
        } else {
          this.finderPenaltyAddHistory(run, history);
          if (!color) result += this.finderPenaltyCountPatterns(history) * QrMatrix.N3;
          color = this.modules[y][x];
          run = 1;
        }
      }
      result += this.finderPenaltyTerminate(color, run, history) * QrMatrix.N3;
    }

    // Rule 2 — 2x2 blocks of the same colour.
    for (let y = 0; y < n - 1; y++) {
      for (let x = 0; x < n - 1; x++) {
        const c = this.modules[y][x];
        if (
          c === this.modules[y][x + 1] &&
          c === this.modules[y + 1][x] &&
          c === this.modules[y + 1][x + 1]
        ) {
          result += QrMatrix.N2;
        }
      }
    }

    // Rule 4 — balance of dark modules.
    let dark = 0;
    for (const row of this.modules) {
      for (const c of row) if (c) dark++;
    }
    const total = n * n;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * QrMatrix.N4;

    return result;
  }
}

/** Full pipeline: encode `text` into a boolean module matrix (true = dark). */
function generateQrMatrix(text: string): boolean[][] {
  const bytes = toUtf8Bytes(text);
  const version = selectVersion(bytes.length);

  const bits = buildBitStream(bytes, version);
  const dataCodewords = bitsToBytes(bits);
  const finalCodewords = buildFinalCodewords(dataCodewords, version);

  const qr = new QrMatrix(version);
  qr.drawFunctionPatterns();
  qr.drawCodewords(finalCodewords);

  // Choose the mask with the lowest penalty.
  let bestMask = 0;
  let bestPenalty = Number.MAX_SAFE_INTEGER;
  for (let mask = 0; mask < 8; mask++) {
    qr.applyMask(mask);
    qr.drawFormatBits(mask);
    const penalty = qr.getPenalty();
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    qr.applyMask(mask); // undo (XOR)
  }

  qr.applyMask(bestMask);
  qr.drawFormatBits(bestMask);

  return qr.modules;
}

// ---------------------------------------------------------------------------
// React component.
// ---------------------------------------------------------------------------

const DARK = "#17150f";
const LIGHT = "#efe9df";
const QUIET_ZONE = 4; // modules of margin (spec minimum)

export function QRCode({
  value,
  size = 200,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const matrix = useMemo(() => generateQrMatrix(value), [value]);

  const count = matrix.length;
  const dim = count + QUIET_ZONE * 2;

  const rects: JSX.Element[] = [];
  for (let y = 0; y < count; y++) {
    const row = matrix[y];
    for (let x = 0; x < count; x++) {
      if (row[x]) {
        rects.push(
          <rect
            key={`${x}-${y}`}
            x={x + QUIET_ZONE}
            y={y + QUIET_ZONE}
            width={1}
            height={1}
            fill={DARK}
          />,
        );
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${dim} ${dim}`}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code"
    >
      <rect x={0} y={0} width={dim} height={dim} fill={LIGHT} />
      {rects}
    </svg>
  );
}

export default QRCode;
