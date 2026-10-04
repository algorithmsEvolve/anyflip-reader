import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "@/lib/supabase/config";

export function createBrowserClient() {
  const { url, publishableKey } = getSupabaseConfig();
  return createSupabaseBrowserClient(url, publishableKey);
}
