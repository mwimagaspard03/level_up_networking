import { NextResponse, type NextRequest } from 'next/server';
import { hasSameOrigin } from '@/src/lib/auth/request';
import { PASSWORD_FLOW_COOKIE } from '@/src/lib/auth/password-flow';
import { createSupabaseServerClient } from '@/src/lib/supabase/server';

export async function POST(request: NextRequest) {
  const destination = new URL('/login', request.url);
  if (!hasSameOrigin(request)) {
    destination.searchParams.set('error', 'logout');
    return NextResponse.redirect(destination, 303);
  }

  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    destination.searchParams.set('error', 'logout');
  }

  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(PASSWORD_FLOW_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
