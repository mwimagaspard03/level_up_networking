import { NextResponse, type NextRequest } from 'next/server';
import { hasSameOrigin, readJsonObject } from '@/src/lib/auth/request';
import {
  PASSWORD_FLOW_COOKIE,
  verifyPasswordFlowToken,
  type PasswordFlowIntent,
} from '@/src/lib/auth/password-flow';
import { createSupabaseServerClient } from '@/src/lib/supabase/server';

export const runtime = 'nodejs';

type PasswordUpdateFlow = PasswordFlowIntent | 'account';

function privateJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return privateJson({ message: 'Origine de requête refusée.' }, 403);
  }

  const body = await readJsonObject(request);
  if (
    !body ||
    typeof body.password !== 'string' ||
    body.password.length < 12 ||
    body.password.length > 128 ||
    (body.flow !== 'account' && body.flow !== 'recovery' && body.flow !== 'invitation')
  ) {
    return privateJson({ message: 'Vérifiez le nouveau mot de passe et le parcours demandé.' }, 400);
  }

  const flow = body.flow as PasswordUpdateFlow;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error: claimsError } = await supabase.auth.getClaims();
    const subject = data?.claims?.sub;
    if (claimsError || typeof subject !== 'string') {
      return privateJson({ message: 'Session expirée. Connectez-vous puis réessayez.' }, 401);
    }

    const flowToken = request.cookies.get(PASSWORD_FLOW_COOKIE)?.value;
    if (flow === 'account') {
      const completingRecovery = verifyPasswordFlowToken(flowToken, 'recovery', subject);
      const completingInvitation = verifyPasswordFlowToken(flowToken, 'invitation', subject);
      if (completingRecovery || completingInvitation) {
        return privateJson({ message: 'Terminez le parcours de récupération ou d’invitation déjà commencé.' }, 403);
      }
    } else if (!verifyPasswordFlowToken(flowToken, flow, subject)) {
      return privateJson({ message: 'Le lien de récupération ou d’invitation est invalide ou expiré.' }, 403);
    }

    const { error } = await supabase.auth.updateUser({ password: body.password });
    if (error) {
      return privateJson({ message: 'Le mot de passe n’a pas pu être mis à jour.' }, 400);
    }

    const response = privateJson({ ok: true });
    response.cookies.set(PASSWORD_FLOW_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch {
    return privateJson({ message: 'Le service de connexion n’est pas encore configuré.' }, 503);
  }
}
