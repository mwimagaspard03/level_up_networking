import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/src/lib/supabase/server';
import { isAppRole, type Profile } from './roles';

export async function getRequestIdentity(
  client?: SupabaseClient,
): Promise<{ client: SupabaseClient; profile: Profile | null }> {
  const supabase = client ?? (await createSupabaseServerClient());
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const subject = claimsData?.claims?.sub;

  if (claimsError || typeof subject !== 'string') {
    return { client: supabase, profile: null };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .eq('id', subject)
    .maybeSingle();

  if (error || !data || !isAppRole(data.role)) {
    return { client: supabase, profile: null };
  }

  return {
    client: supabase,
    profile: {
      id: data.id,
      display_name: data.display_name,
      role: data.role,
    },
  };
}
