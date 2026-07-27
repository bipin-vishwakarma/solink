import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when Supabase env vars are present — flips the app from Demo to Cloud mode. */
export const hasSupabase = Boolean(url && anon);

/**
 * A single browser Supabase client (or null in Demo Mode). detectSessionInUrl lets the
 * Google OAuth redirect complete automatically.
 */
export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(url as string, anon as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export interface Profile {
  id: string;
  username: string;
  public_key: string;
  avatar_url?: string | null;
}
