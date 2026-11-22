import { NextResponse, type NextRequest } from 'next/server';
import { hasSameOrigin, isValidEmail, readJsonObject, authCallbackUrl } from '@/src/lib/auth/request';
import { createSupabaseServerClient } from '@/src/lib/supabase/server';
import { writeAuditEvent } from '@/src/lib/auth/audit';

const genericMessage = 'Si un compte correspond à cette adresse et si l’envoi est disponible, des instructions seront transmises.';

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: 'Origine de requête refusée.' }, { status: 403 });
  }

  const body = await readJsonObject(request);
  if (!body || !isValidEmail(body.email)) {
    return NextResponse.json({ message: 'Saisissez une adresse e-mail valide.' }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  let providerError = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authCallbackUrl('/reset-password'),
    });
    providerError = Boolean(error);
  } catch {
    return NextResponse.json(
      { message: 'La demande ne peut pas être traitée pour le moment. Réessayez plus tard.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  await writeAuditEvent({
    actorUserId: null,
    targetEmail: email,
    action: 'password_recovery_requested',
    details: { provider_error: providerError },
  });

  return NextResponse.json(
    { ok: true, message: genericMessage },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
