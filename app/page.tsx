"use client";

import { hasSupabase } from "@/lib/supabaseClient";
import { DemoApp } from "@/components/DemoApp";
import { CloudApp } from "@/components/CloudApp";

export default function Home() {
  // Cloud mode (Google login + saved history) when Supabase env vars are set,
  // otherwise the backend-free Demo mode.
  return hasSupabase ? <CloudApp /> : <DemoApp />;
}
