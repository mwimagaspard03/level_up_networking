'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicEnvironment } from './env';

export function createSupabaseBrowserClient() {
  const environment = getSupabasePublicEnvironment();
  if (!environment) return null;

  return createBrowserClient(environment.url, environment.publishableKey);
}
