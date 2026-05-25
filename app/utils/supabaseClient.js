import { createClient } from "@supabase/supabase-js";

export function getSupabase() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://dummy.supabase.co";

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "dummy-anon-key";

  return createClient(supabaseUrl, supabaseAnonKey);
}
