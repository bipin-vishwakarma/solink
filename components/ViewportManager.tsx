"use client";

import { useEffect } from "react";

/**
 * Keeps CSS custom properties in sync with the *visual* viewport so the app
 * shell can shrink above the on-screen keyboard.
 *
 * - `--app-height`: the visible height (visualViewport.height). The chat shell
 *   binds its height to this, so its bottom edge (the composer) always sits at
 *   the top of the keyboard instead of behind it. iOS Safari never shrinks
 *   `dvh`/`vh` for the keyboard, which is why this JS is needed.
 * - `--kb`: the keyboard's height, for anything that wants to offset by it.
 *
 * Renders nothing. Mounted once at the app root.
 */
export function ViewportManager() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    let raf = 0;

    const apply = () => {
      raf = 0;
      const height = vv ? vv.height : window.innerHeight;
      // On iOS the layout viewport (innerHeight) stays full-height while the
      // keyboard overlays it, so this yields the true keyboard height. On
      // Android (resizes-content) innerHeight shrinks too, so it's ~0.
      const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      root.style.setProperty("--app-height", `${Math.round(height)}px`);
      root.style.setProperty("--kb", `${Math.round(kb)}px`);
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    apply();

    if (vv) {
      vv.addEventListener("resize", schedule);
      vv.addEventListener("scroll", schedule);
    }
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);

    return () => {
      if (vv) {
        vv.removeEventListener("resize", schedule);
        vv.removeEventListener("scroll", schedule);
      }
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
