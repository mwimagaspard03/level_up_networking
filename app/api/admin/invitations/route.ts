import { NextResponse, type NextRequest } from 'next/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import { hasSameOrigin, isValidEmail, readJsonObject, authCallbackUrl } from '@/src/lib/auth/request';
import { writeAuditEvent } from '@/src/lib/auth/audit';
import { createSupabaseAdminClient } from '@/src/lib/supabase/admin';
import { canInviteRole } from '@/src/lib/auth/roles';

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: 'Origine de requête refusée.' }, { status: 403 });
  }

  const body = await readJsonObject(request);
  const requestedRole = body?.role === undefined ? 'STUDENT' : body.role;
  if (!body || !isValidEmail(body.email) || (requestedRole !== 'STUDENT' && requestedRole !== 'ADMIN')) {
    return NextResponse.json({ message: 'Adresse ou rôle de compte invalide.' }, { status: 400 });
  }

  try {
    const identity = await getRequestIdentity();
    if (!identity.profile || !canInviteRole(identity.profile.role, requestedRole)) {
      return NextResponse.json({ message: 'Autorisation insuffisante.' }, { status: 403 });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(
      body.email.trim().toLowerCase(),
      { redirectTo: authCallbackUrl('/auth/complete-account') },
    );

    if (error || !data.user?.id) {
      return NextResponse.json(
        { message: 'L’invitation n’a pas pu être créée. Vérifiez le compte et réessayez.' },
        { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    let promoted = requestedRole === 'STUDENT';
    if (requestedRole === 'ADMIN') {
      const { error: promotionError } = await identity.client.rpc('owner_set_profile_role', {
        p_target_profile_id: data.user.id,
        p_new_role: 'ADMIN',
      });
      promoted = !promotionError;
    }

    const eventWritten = await writeAuditEvent({
      actorUserId: identity.profile.id,
      targetUserId: data.user.id,
      targetEmail: body.email.trim().toLowerCase(),
      action: promoted ? (requestedRole === 'ADMIN' ? 'admin_invited' : 'student_invited') : 'student_invited',
      details: promoted ? undefined : { requested_role: 'ADMIN', promotion_failed: true },
    });

    if (!eventWritten) {
      return NextResponse.json(
        {
          actionCompleted: true,
          message: 'L’invitation a été envoyée, mais son journal d’audit n’a pas pu être confirmé. Ne relancez pas avant vérification.',
        },
        { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    if (!promoted) {
      return NextResponse.json(
        {
          ok: true,
          partial: true,
          message: 'Invitation envoyée. La promotion ADMIN a échoué; ce compte reste STUDENT. Le propriétaire peut vérifier le compte puis retenter la modification du rôle.',
        },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: 'Invitation traitée. La livraison de l’e-mail dépend de la configuration SMTP du propriétaire.',
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json(
      { message: 'Le service d’administration n’est pas encore configuré.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
