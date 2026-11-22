import { NextResponse, type NextRequest } from 'next/server';
import { hasSameOrigin, isValidEmail, readJsonObject } from '@/src/lib/auth/request';
import { PASSWORD_FLOW_COOKIE } from '@/src/lib/auth/password-flow';
import { createSupabaseServerClient } from '@/src/lib/supabase/server';

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: 'Origine de requête refusée.' }, { status: 403 });
  }

  const body = await readJsonObject(request);
  if (!body || !isValidEmail(body.email) || typeof body.password !== 'string' || body.password.length > 128) {
    return NextResponse.json({ message: 'Vérifiez les champs saisis.' }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: body.email.trim().toLowerCase(),
      password: body.password,
    });

    if (error) {
      return NextResponse.json(
        { message: 'E-mail ou mot de passe incorrect.' },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const response = NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
    response.cookies.set(PASSWORD_FLOW_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch {
    return NextResponse.json(
      { message: 'Le service de connexion n’est pas encore configuré.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
