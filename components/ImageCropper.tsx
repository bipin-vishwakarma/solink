"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * ImageCropper — a "cover viewport" crop/edit modal.
 *
 * The user pans + zooms (+ optional 90° rotate) an image behind a fixed crop
 * frame. The frame IS the live preview. On "Done" the region under the frame is
 * rendered to an offscreen canvas at the crop's native source resolution
 * (capped at ~1280px long edge) and handed back as a JPEG Blob.
 *
 * Self-contained: no external deps, pure Canvas API math.
 */

type AspectOption = { label: string; value: number | null };

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const MAX_OUTPUT_LONG_EDGE = 1280;
const FRAME_LONG_MAX = 340;

const ASPECT_OPTIONS: AspectOption[] = [
  { label: "Free", value: null },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "16:9", value: 16 / 9 },
];

export function ImageCropper({
  file,
  aspect,
  lockAspect,
  title,
  onCancel,
  onDone,
}: {
  file: File;
  aspect?: number;
  lockAspect?: boolean;
  title?: string;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Loaded natural image size (0 until decoded).
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  // Viewport size, used to size the crop frame responsively.
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: 360,
    h: 640,
  });

  // Interactive transform state.
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); // degrees: 0 | 90 | 180 | 270
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Chosen aspect. When lockAspect, always the forced aspect (default 1:1).
  const forcedAspect = aspect ?? 1;
  const [aspectChoice, setAspectChoice] = useState<number | null>(
    lockAspect ? forcedAspect : aspect ?? null
  );

  const [exporting, setExporting] = useState(false);

  // ---- load the file into an HTMLImageElement -----------------------------
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = url;
    return () => {
      URL.revokeObjectURL(url);
      imgRef.current = null;
    };
  }, [file]);

  // ---- track viewport size ------------------------------------------------
  useLayoutEffect(() => {
    const measure = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  // Effective aspect ratio of the crop frame (frameW / frameH).
  const effectiveAspect = useMemo(() => {
    if (aspectChoice != null) return aspectChoice;
    // "Free" → use the image's own aspect so the whole image can fit.
    if (natural && natural.h > 0) return natural.w / natural.h;
    return 1;
  }, [aspectChoice, natural]);

  // ---- crop frame size in CSS pixels --------------------------------------
  const frame = useMemo(() => {
    const longCap = Math.min(viewport.w - 32, FRAME_LONG_MAX);
    const heightCap = Math.max(160, viewport.h * 0.55);
    let w: number;
    let h: number;
    if (effectiveAspect >= 1) {
      w = longCap;
      h = longCap / effectiveAspect;
    } else {
      h = longCap;
      w = longCap * effectiveAspect;
    }
    // Never let the frame get taller than the available area.
    if (h > heightCap) {
      const k = heightCap / h;
      h *= k;
      w *= k;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }, [viewport, effectiveAspect]);

  // Rotated source dimensions (rotation is always a 90° multiple, so the
  // displayed image stays axis-aligned).
  const rotatedDims = useCallback(
    (rot: number): { rw: number; rh: number } => {
      const w = natural?.w ?? 1;
      const h = natural?.h ?? 1;
      return rot % 180 === 0 ? { rw: w, rh: h } : { rw: h, rh: w };
    },
    [natural]
  );

  // Base scale at which the (rotated) image exactly covers the frame.
  const coverScale = useMemo(() => {
    const { rw, rh } = rotatedDims(rotation);
    if (rw <= 0 || rh <= 0) return 1;
    return Math.max(frame.w / rw, frame.h / rh);
  }, [frame, rotation, rotatedDims]);

  // Absolute source→screen scale currently applied.
  const scale = coverScale * zoom;

  // Clamp a pan offset so the image always covers the frame (no gaps).
  const clampPan = useCallback(
    (p: { x: number; y: number }, s: number, rot: number) => {
      const { rw, rh } = rotatedDims(rot);
      const maxX = Math.max(0, (rw * s - frame.w) / 2);
      const maxY = Math.max(0, (rh * s - frame.h) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, p.x)),
        y: Math.min(maxY, Math.max(-maxY, p.y)),
      };
    },
    [frame, rotatedDims]
  );

  // Re-clamp whenever scale / rotation / frame changes.
  useEffect(() => {
    if (!natural) return;
    setPan((p) => clampPan(p, scale, rotation));
  }, [natural, scale, rotation, clampPan]);

  // ---- shared draw routine (preview + export) -----------------------------
  // Renders the crop exactly, scaled by `renderScale` (dpr for preview, the
  // export factor for output). Coordinates are in CSS/frame pixels × renderScale.
  const paint = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      renderScale: number,
      p: { x: number; y: number },
      s: number,
      rot: number
    ) => {
      const img = imgRef.current;
      if (!img || !natural) return;
      ctx.save();
      ctx.scale(renderScale, renderScale);
      ctx.translate(frame.w / 2 + p.x, frame.h / 2 + p.y);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(s, s);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, -natural.w / 2, -natural.h / 2, natural.w, natural.h);
      ctx.restore();
    },
    [frame, natural]
  );

  // ---- live preview draw --------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !natural) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(frame.w * dpr);
    canvas.height = Math.round(frame.h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paint(ctx, dpr, pan, scale, rotation);
  }, [natural, frame, pan, scale, rotation, paint]);

  // ---- pointer / touch interaction ---------------------------------------
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef<{
    lastX: number;
    lastY: number;
    lastDist: number;
    zoomAtPinch: number;
  }>({ lastX: 0, lastY: 0, lastDist: 0, zoomAtPinch: 1 });

  const twoPointerState = () => {
    const pts = Array.from(pointers.current.values());
    const [a, b] = pts;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return {
      dist: Math.hypot(dx, dy),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gesture.current.lastX = e.clientX;
      gesture.current.lastY = e.clientY;
    } else if (pointers.current.size === 2) {
      const { dist, midX, midY } = twoPointerState();
      gesture.current.lastDist = dist;
      gesture.current.zoomAtPinch = zoom;
      gesture.current.lastX = midX;
      gesture.current.lastY = midY;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2) {
      const { dist, midX, midY } = twoPointerState();
      if (gesture.current.lastDist > 0) {
        const ratio = dist / gesture.current.lastDist;
        const nextZoom = Math.min(
          ZOOM_MAX,
          Math.max(ZOOM_MIN, gesture.current.zoomAtPinch * ratio)
        );
        setZoom(nextZoom);
      }
      const dx = midX - gesture.current.lastX;
      const dy = midY - gesture.current.lastY;
      gesture.current.lastX = midX;
      gesture.current.lastY = midY;
      setPan((p) => clampPan({ x: p.x + dx, y: p.y + dy }, scale, rotation));
      return;
    }

    // single-pointer pan
    const dx = e.clientX - gesture.current.lastX;
    const dy = e.clientY - gesture.current.lastY;
    gesture.current.lastX = e.clientX;
    gesture.current.lastY = e.clientY;
    setPan((p) => clampPan({ x: p.x + dx, y: p.y + dy }, scale, rotation));
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) {
      const remaining = Array.from(pointers.current.values())[0];
      gesture.current.lastX = remaining.x;
      gesture.current.lastY = remaining.y;
    }
  };

  // ---- actions ------------------------------------------------------------
  const rotate90 = () => {
    setRotation((r) => (r + 90) % 360);
    // pan is re-clamped by the effect; keep it centered-ish on rotate
    setPan({ x: 0, y: 0 });
  };

  const pickAspect = (value: number | null) => {
    setAspectChoice(value);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleDone = () => {
    if (!natural || !imgRef.current || exporting) return;
    setExporting(true);

    const nativeW = frame.w / scale;
    const nativeH = frame.h / scale;
    const nativeLong = Math.max(nativeW, nativeH);
    const frameLong = Math.max(frame.w, frame.h);
    const targetLong = Math.min(nativeLong, MAX_OUTPUT_LONG_EDGE);
    const k = frameLong > 0 ? targetLong / frameLong : 1;

    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(frame.w * k));
    out.height = Math.max(1, Math.round(frame.h * k));
    const ctx = out.getContext("2d");
    if (!ctx) {
      setExporting(false);
      return;
    }
    paint(ctx, k, pan, scale, rotation);

    out.toBlob(
      (blob) => {
        setExporting(false);
        if (blob) onDone(blob);
      },
      "image/jpeg",
      0.9
    );
  };

  const showAspectRow = !lockAspect;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+var(--safe-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Crop image"}
    >
      <div className="slide-up flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border border-brand-border bg-brand-surface p-4 text-brand-text shadow-2xl">
        {title ? (
          <h2 className="text-center text-base font-semibold">{title}</h2>
        ) : null}

        {/* Crop stage */}
        <div className="flex items-center justify-center">
          <div
            className="relative touch-none select-none overflow-hidden rounded-xl bg-brand-surface2"
            style={{ width: frame.w, height: frame.h }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
          >
            <canvas
              ref={canvasRef}
              className="block h-full w-full cursor-grab active:cursor-grabbing"
              style={{ width: frame.w, height: frame.h }}
            />
            {/* framing guides */}
            <div className="pointer-events-none absolute inset-0 ring-1 ring-white/20" />
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/10" />
              ))}
            </div>
            {!natural ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-brand-muted">
                Loading…
              </div>
            ) : null}
          </div>
        </div>

        {/* Zoom slider + rotate */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-brand-muted" aria-hidden>
            −
          </span>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-brand-border accent-brand-accent"
          />
          <span className="text-xs text-brand-muted" aria-hidden>
            +
          </span>
          <button
            type="button"
            onClick={rotate90}
            aria-label="Rotate 90 degrees"
            title="Rotate 90°"
            className="pressable rounded-lg border border-brand-border bg-brand-surface2 px-2.5 py-1.5 text-sm text-brand-text hover:bg-white/10"
          >
            ⟳
          </button>
        </div>

        {/* Aspect ratio row */}
        {showAspectRow ? (
          <div className="flex items-center justify-center gap-2">
            {ASPECT_OPTIONS.map((opt) => {
              const active =
                (opt.value == null && aspectChoice == null) ||
                (opt.value != null &&
                  aspectChoice != null &&
                  Math.abs(opt.value - aspectChoice) < 1e-6);
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => pickAspect(opt.value)}
                  className={
                    "pressable rounded-lg border px-3 py-1.5 text-xs font-medium " +
                    (active
                      ? "border-brand-accent bg-brand-accentSoft text-brand-text"
                      : "border-brand-border bg-brand-surface2 text-brand-muted hover:bg-white/10")
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="pressable flex-1 rounded-xl border border-brand-border bg-brand-surface2 px-4 py-2.5 text-sm font-medium text-brand-text hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDone}
            disabled={!natural || exporting}
            className="pressable flex-1 rounded-xl bg-brand-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-accentHover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? "Saving…" : "Use photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
