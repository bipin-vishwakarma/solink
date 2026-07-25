"use client";

import { useEffect, useState } from "react";
import { hasSupabase } from "@/lib/supabaseClient";
import { DemoApp } from "@/components/DemoApp";
import { CloudApp } from "@/components/CloudApp";
import { Onboarding } from "@/components/Onboarding";

export default function Home() {
  // Default to "onboarded" so the server render and first client render match
  // (avoids a hydration mismatch); correct it from localStorage after mount.
  const [onboarded, setOnboarded] = useState(true);

  useEffect(() => {
    setOnboarded(localStorage.getItem("solink:onboarded") === "1");
  }, []);

  if (!onboarded) {
    return (
      <Onboarding
        onDone={() => {
          localStorage.setItem("solink:onboarded", "1");
          setOnboarded(true);
        }}
      />
    );
  }

  // Cloud mode (Google login + saved history) when Supabase env vars are set,
  // otherwise the backend-free Demo mode.
  return hasSupabase ? <CloudApp /> : <DemoApp />;
}
