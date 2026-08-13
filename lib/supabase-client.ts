import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

const projectUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

export const cloudConfigured = Boolean(projectUrl && publishableKey);

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(projectUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export type CloudSession = Session;
export type CloudUser = User;
