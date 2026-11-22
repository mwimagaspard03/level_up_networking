import 'server-only';

import { createSupabaseAdminClient } from '@/src/lib/supabase/admin';

export type AuditAction =
  | 'student_invited'
  | 'admin_invited'
  | 'role_changed'
  | 'invite_resent'
  | 'password_recovery_requested'
  | 'account_access_revoked';

type AuditEvent = {
  actorUserId: string | null;
  targetUserId?: string | null;
  targetEmail?: string | null;
  action: AuditAction;
  details?: Record<string, string | number | boolean | null>;
};

export async function writeAuditEvent(event: AuditEvent): Promise<boolean> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from('account_audit_logs').insert({
      actor_user_id: event.actorUserId,
      target_user_id: event.targetUserId ?? null,
      target_email: event.targetEmail ?? null,
      action: event.action,
      details: event.details ?? {},
    });
    return !error;
  } catch {
    return false;
  }
}
