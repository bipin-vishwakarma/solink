"use client";

import { useState } from "react";
import { LogoMark, LogoWordmark } from "@/components/Logo";

type Slide = {
  key: string;
  render: () => JSX.Element;
  headline: string;
  subtitle: string;
};

const SLIDES: Slide[] = [
  {
    key: "welcome",
    headline: "Encrypted chat, disguised as code",
    subtitle:
      "Solink is private messaging in disguise — talk freely, anywhere, without a chat app ever showing on your screen.",
    render: () => (
      <div className="flex flex-col items-center gap-4 pop-in">
        <LogoMark size={72} />
        <LogoWordmark />
      </div>
    ),
  },
  {
    key: "boss-mode",
    headline: "Boss Mode",
    subtitle:
      "Your messages turn into code on the fly. Hit the panic key (Ctrl+Shift+.) to flip into a fake VS Code, and tap any snippet to reveal the real text.",
    render: () => (
      <div className="flex items-center gap-3 pop-in text-6xl leading-none">
        <span aria-hidden>🥷</span>
        <span aria-hidden>🚨</span>
      </div>
    ),
  },
  {
    key: "e2ee",
    headline: "Truly private",
    subtitle:
      "Messages are end-to-end encrypted on your device. The server only ever stores ciphertext — no one else can read a thing.",
    render: () => (
      <div className="pop-in text-7xl leading-none">
        <span aria-hidden>🔒</span>
      </div>
    ),
  },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  const goNext = () => {
    if (isLast) {
      onDone();
    } else {
      setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
    }
  };

  const goTo = (i: number) => setIndex(i);

  return (
    <div className="relative flex h-dvh flex-col bg-transparent px-6 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+var(--safe-bottom))] text-brand-text">
      {/* Skip button, top-right */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className="pressable rounded-full px-3 py-1.5 text-sm font-medium text-brand-muted hover:text-brand-text"
        >
          Skip
        </button>
      </div>

      {/* Centered slide content */}
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div key={slide.key} className="flex flex-col items-center gap-7 slide-up">
          <div className="flex min-h-[96px] items-center justify-center">
            {slide.render()}
          </div>

          <div className="flex max-w-sm flex-col gap-3 fade-in">
            <h1 className="text-3xl font-semibold tracking-tight text-brand-text">
              {slide.headline}
            </h1>
            <p className="text-base leading-relaxed text-brand-muted">
              {slide.subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Footer: dots + primary action */}
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-2" role="tablist" aria-label="Slides">
          {SLIDES.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => goTo(i)}
              className={`pressable h-2 rounded-full transition-all duration-300 ${
                i === index ? "w-6 bg-brand-accent" : "w-2 bg-white/20"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={goNext}
          className="pressable w-full max-w-sm rounded-2xl bg-brand-accent px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-black/20 hover:bg-brand-accentHover"
        >
          {isLast ? "Get started" : "Next"}
        </button>
      </div>
    </div>
  );
}
