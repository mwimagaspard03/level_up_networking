import { NextResponse, type NextRequest } from 'next/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import { hasSameOrigin, isValidUuid, readJsonObject, authCallbackUrl } from '@/src/lib/auth/request';
import { writeAuditEvent } from '@/src/lib/auth/audit';
import { createSupabaseAdminClient } from '@/src/lib/supabase/admin';
import { canResendInvitation } from '@/src/lib/auth/roles';

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: 'Origine de requête refusée.' }, { status: 403 });
  }

  const body = await readJsonObject(request);
  if (!body || !isValidUuid(body.userId)) {
    return NextResponse.json({ message: 'Compte cible invalide.' }, { status: 400 });
  }

  try {
    const identity = await getRequestIdentity();
    if (!identity.profile) {
      return NextResponse.json({ message: 'Autorisation insuffisante.' }, { status: 403 });
    }

    const { data: target, error: targetError } = await identity.client
      .from('profiles')
      .select('id, role')
      .eq('id', body.userId)
      .maybeSingle();

    if (targetError || !target || target.role === 'OWNER') {
      return NextResponse.json({ message: 'Compte cible non disponible.' }, { status: 404 });
    }
    if (!canResendInvitation(identity.profile.role, target.role)) {
      return NextResponse.json({ message: 'Ce rôle ne peut pas renvoyer cette invitation.' }, { status: 403 });
    }

    const admin = createSupabaseAdminClient();
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(body.userId);
    const targetEmail = userData.user?.email;
    if (userError || !targetEmail) {
      return NextResponse.json({ message: 'Compte cible non disponible.' }, { status: 404 });
    }
    if (userData.user.email_confirmed_at) {
      return NextResponse.json({ message: 'Ce compte a déjà confirmé son adresse e-mail.' }, { status: 409 });
    }

    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(targetEmail, {
      redirectTo: authCallbackUrl('/auth/complete-account'),
    });
    if (inviteError) {
      return NextResponse.json(
        { message: 'Le renvoi n’a pas pu être traité. Vérifiez la configuration d’envoi du propriétaire.' },
        { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const eventWritten = await writeAuditEvent({
      actorUserId: identity.profile.id,
      targetUserId: body.userId,
      targetEmail,
      action: 'invite_resent',
    });
    if (!eventWritten) {
      return NextResponse.json(
        { actionCompleted: true, message: 'Le renvoi a été traité, mais le journal d’audit n’a pas pu être confirmé. Vérifiez avant toute nouvelle tentative.' },
        { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    return NextResponse.json(
      { ok: true, message: 'Renvoi traité. La livraison de l’e-mail dépend de la configuration SMTP du propriétaire.' },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json(
      { message: 'Le service d’administration n’est pas encore configuré.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
