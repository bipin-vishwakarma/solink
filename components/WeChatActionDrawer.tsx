"use client";

import { useId, useRef } from "react";

export interface WeChatActionItem {
  id: string;
  name: string;
  subname: string;
  icon: string;
  bgColor: string;
  badge?: string;
}

const WECHAT_ACTION_ITEMS: WeChatActionItem[] = [
  {
    id: "photos",
    name: "Photos",
    subname: "相册",
    icon: "🖼️",
    bgColor: "bg-emerald-600/90 text-emerald-100 ring-emerald-500/30",
  },
  {
    id: "camera",
    name: "Camera",
    subname: "拍摄",
    icon: "📷",
    bgColor: "bg-blue-600/90 text-blue-100 ring-blue-500/30",
  },
  {
    id: "location",
    name: "Location",
    subname: "位置",
    icon: "📍",
    bgColor: "bg-amber-600/90 text-amber-100 ring-amber-500/30",
  },
  {
    id: "files",
    name: "Files",
    subname: "文件",
    icon: "📁",
    bgColor: "bg-purple-600/90 text-purple-100 ring-purple-500/30",
  },
  {
    id: "call",
    name: "Voice Call",
    subname: "语音通话",
    icon: "📞",
    bgColor: "bg-cyan-600/90 text-cyan-100 ring-cyan-500/30",
  },
  {
    id: "lucky",
    name: "Red Packet",
    subname: "红包",
    icon: "🧧",
    bgColor: "bg-red-600/90 text-red-100 ring-red-500/30",
    badge: "Lucky",
  },
  {
    id: "contact",
    name: "Contact Card",
    subname: "名片",
    icon: "📇",
    bgColor: "bg-indigo-600/90 text-indigo-100 ring-indigo-500/30",
  },
  {
    id: "favorites",
    name: "Favorites",
    subname: "收藏",
    icon: "⭐",
    bgColor: "bg-yellow-600/90 text-yellow-100 ring-yellow-500/30",
  },
];

export function WeChatActionDrawer({
  onAttachFile,
  onShareLocation,
  onCustomAction,
}: {
  onAttachFile: (file: File) => void;
  onShareLocation: () => void;
  onCustomAction?: (actionId: string) => void;
}) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const photoInputId = useId();
  const cameraInputId = useId();
  const fileInputId = useId();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onAttachFile(file);
    e.target.value = "";
  };

  const handleActionClick = (id: string) => {
    switch (id) {
      case "photos":
        photoInputRef.current?.click();
        break;
      case "camera":
        cameraInputRef.current?.click();
        break;
      case "location":
        onShareLocation();
        break;
      case "files":
        fileInputRef.current?.click();
        break;
      default:
        onCustomAction?.(id);
        break;
    }
  };

  return (
    <div className="w-full h-[285px] sm:h-[300px] border-t border-brand-border bg-brand-surface/95 backdrop-blur p-4 select-none overflow-y-auto overscroll-contain animate-in fade-in slide-in-from-bottom-2 duration-150 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {/* Hidden file inputs */}
      <input
        id={photoInputId}
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        id={cameraInputId}
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        id={fileInputId}
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 2-row x 4-column Action Grid */}
      <div className="grid grid-cols-4 gap-y-4 gap-x-2 sm:gap-x-4 max-w-lg mx-auto">
        {WECHAT_ACTION_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => handleActionClick(item.id)}
            type="button"
            className="pressable group flex flex-col items-center justify-center gap-1.5 focus:outline-none"
          >
            <div className="relative">
              <div
                className={`flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl text-2xl sm:text-3xl shadow-md ring-1 transition duration-150 group-hover:scale-105 group-active:scale-95 ${item.bgColor}`}
              >
                {item.icon}
              </div>
              {item.badge && (
                <span className="absolute -top-1 -right-1 rounded-full bg-red-500 px-1.5 py-0.2 text-[9px] font-bold text-white shadow-sm ring-1 ring-black/40">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[11.5px] font-medium text-brand-muted group-hover:text-brand-text transition text-center leading-tight">
              {item.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
