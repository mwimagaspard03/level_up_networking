import { NextResponse, type NextRequest } from 'next/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import { hasSameOrigin, isValidUuid, readJsonObject } from '@/src/lib/auth/request';
import { writeAuditEvent } from '@/src/lib/auth/audit';
import { canChangeRole } from '@/src/lib/auth/roles';

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: 'Origine de requête refusée.' }, { status: 403 });
  }

  const body = await readJsonObject(request);
  if (!body || !isValidUuid(body.targetUserId) || !['OWNER', 'ADMIN', 'STUDENT'].includes(String(body.newRole))) {
    return NextResponse.json({ message: 'Compte cible ou rôle invalide.' }, { status: 400 });
  }

  try {
    const identity = await getRequestIdentity();
    if (!identity.profile || !canChangeRole(identity.profile.role, body.newRole)) {
      return NextResponse.json({ message: 'Seul le propriétaire peut modifier les rôles.' }, { status: 403 });
    }

    const { data: target, error: targetError } = await identity.client
      .from('profiles')
      .select('id, role')
      .eq('id', body.targetUserId)
      .maybeSingle();

    if (targetError || !target) {
      return NextResponse.json({ message: 'Compte cible non disponible.' }, { status: 404 });
    }
    if (target.role === body.newRole) {
      return NextResponse.json({ message: 'Ce compte possède déjà ce rôle.' }, { status: 409 });
    }

    const { error: roleError } = await identity.client.rpc('owner_set_profile_role', {
      p_target_profile_id: body.targetUserId,
      p_new_role: body.newRole as 'OWNER' | 'ADMIN' | 'STUDENT',
    });
    if (roleError) {
      return NextResponse.json(
        { message: 'Le changement de rôle a été refusé. Vérifiez notamment qu’un autre OWNER reste actif.' },
        { status: 409, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const eventWritten = await writeAuditEvent({
      actorUserId: identity.profile.id,
      targetUserId: body.targetUserId,
      action: 'role_changed',
      details: { old_role: target.role, new_role: body.newRole },
    });
    if (!eventWritten) {
      return NextResponse.json(
        { actionCompleted: true, message: 'Le rôle a été modifié, mais le journal d’audit n’a pas pu être confirmé. Vérifiez avant toute nouvelle action.' },
        { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    return NextResponse.json(
      { ok: true, message: 'Rôle mis à jour.' },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json(
      { message: 'Le service d’administration n’est pas encore configuré.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
