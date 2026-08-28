"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";

interface VoiceNotePlayerProps {
  src: string;
  isMine?: boolean;
}

// Module-level audio coordination to pause other playing instances
let activeAudioElement: HTMLAudioElement | null = null;
const pauseListeners = new Set<() => void>();

function notifyPlay(audio: HTMLAudioElement, onPause: () => void) {
  if (activeAudioElement && activeAudioElement !== audio) {
    activeAudioElement.pause();
    pauseListeners.forEach((fn) => fn());
    pauseListeners.clear();
  }
  activeAudioElement = audio;
  pauseListeners.add(onPause);
}

// Deterministic waveform heights (28 bars) from URL hash so each audio has a consistent look
function generateWaveformHeights(str: string, count = 28): number[] {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const heights: number[] = [];
  for (let i = 0; i < count; i++) {
    const pseudo = Math.abs(Math.sin(hash + i * 1.73)) * 0.75 + 0.25;
    heights.push(Math.round(pseudo * 100));
  }
  return heights;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceNotePlayer({ src, isMine = false }: VoiceNotePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const [isLoaded, setIsLoaded] = useState(false);

  const waveformBars = useMemo(() => generateWaveformHeights(src), [src]);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
        setIsLoaded(true);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);

    // If metadata is already cached
    if (audio.readyState >= 1 && Number.isFinite(audio.duration)) {
      setDuration(audio.duration);
      setIsLoaded(true);
    }

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.pause();
      if (activeAudioElement === audio) {
        activeAudioElement = null;
      }
    };
  }, [src]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      notifyPlay(audio, () => setIsPlaying(false));
      audio.playbackRate = speed;
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [isPlaying, speed]);

  const cycleSpeed = useCallback(() => {
    const nextSpeed: 1 | 1.5 | 2 = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  }, [speed]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const el = waveformRef.current;
    const audio = audioRef.current;
    if (!el || !audio || !duration) return;

    const rect = el.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const ratio = offsetX / rect.width;
    const targetTime = ratio * duration;

    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const activeBarIndex = Math.floor(progress * waveformBars.length);

  return (
    <div
      className={`flex items-center gap-2.5 rounded-2xl py-1.5 px-2.5 select-none transition-colors ${
        isMine
          ? "bg-black/15 text-white"
          : "bg-brand-surface2/60 text-brand-text border border-brand-border/40"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Play / Pause Circular Button */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
        className={`pressable grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${
          isMine
            ? "bg-white text-brand-accent hover:bg-white/90 shadow-md"
            : "bg-brand-accent text-white hover:bg-brand-accentHover shadow-md"
        }`}
      >
        {isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1.5" />
            <rect x="14" y="4" width="4" height="16" rx="1.5" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
            <path d="M7 4v16l13-8z" />
          </svg>
        )}
      </button>

      {/* Waveform and Progress Bar */}
      <div className="flex flex-1 flex-col gap-1 min-w-[130px] max-w-[220px]">
        <div
          ref={waveformRef}
          onClick={handleSeek}
          className="flex h-6 w-full cursor-pointer items-center gap-[3px] py-1"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
          tabIndex={0}
        >
          {waveformBars.map((h, i) => {
            const isPlayed = i <= activeBarIndex;
            return (
              <span
                key={i}
                style={{ height: `${h}%` }}
                className={`w-[3px] rounded-full transition-all duration-75 ${
                  isPlayed
                    ? isMine
                      ? "bg-white"
                      : "bg-brand-accent"
                    : isMine
                    ? "bg-white/35 hover:bg-white/50"
                    : "bg-brand-muted/40 hover:bg-brand-muted/60"
                }`}
              />
            );
          })}
        </div>

        {/* Time and Duration Counter */}
        <div className="flex items-center justify-between text-[11px] font-mono leading-none opacity-80">
          <span>{formatTime(isPlaying ? currentTime : duration || currentTime)}</span>
          {isLoaded && duration > 0 && !isPlaying && <span>{formatTime(duration)}</span>}
        </div>
      </div>

      {/* Speed Multiplier Button (1x, 1.5x, 2x) */}
      <button
        type="button"
        onClick={cycleSpeed}
        className={`pressable rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-tight transition ${
          isMine
            ? "bg-white/20 text-white hover:bg-white/30"
            : "bg-brand-border/60 text-brand-muted hover:text-brand-text hover:bg-brand-border"
        }`}
        title="Playback speed"
        aria-label={`Playback speed ${speed}x`}
      >
        {speed}x
      </button>
    </div>
  );
}
