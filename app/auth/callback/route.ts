import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeInternalPath } from '@/src/lib/auth/redirect';
import {
  createPasswordFlowToken,
  PASSWORD_FLOW_COOKIE,
  type PasswordFlowIntent,
} from '@/src/lib/auth/password-flow';
import { createSupabaseServerClient } from '@/src/lib/supabase/server';

export const runtime = 'nodejs';

function callbackError(request: NextRequest) {
  const url = new URL('/login', request.url);
  url.searchParams.set('error', 'auth_callback');
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(PASSWORD_FLOW_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const next = safeInternalPath(request.nextUrl.searchParams.get('next'), '/dashboard');
  const code = request.nextUrl.searchParams.get('code');
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const rawType = request.nextUrl.searchParams.get('type');
  const flowIntent: PasswordFlowIntent | null =
    rawType === 'recovery' ? 'recovery' : rawType === 'invite' ? 'invitation' : null;

  try {
    const supabase = await createSupabaseServerClient();
    let error: { message: string } | null = null;

    if (code && code.length <= 2048) {
      ({ error } = await supabase.auth.exchangeCodeForSession(code));
    } else if (
      tokenHash &&
      tokenHash.length <= 512 &&
      (rawType === 'invite' || rawType === 'recovery')
    ) {
      ({ error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: rawType as EmailOtpType,
      }));
    } else {
      return callbackError(request);
    }

    if (error) return callbackError(request);

    const destination =
      flowIntent === 'recovery'
        ? '/reset-password'
        : flowIntent === 'invitation'
          ? '/auth/complete-account'
          : next;
    const response = NextResponse.redirect(new URL(destination, request.url), 303);
    response.cookies.set(PASSWORD_FLOW_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    if (flowIntent) {
      const { data, error: claimsError } = await supabase.auth.getClaims();
      const subject = data?.claims?.sub;
      if (claimsError || typeof subject !== 'string') return callbackError(request);

      const token = createPasswordFlowToken(flowIntent, subject);
      if (!token) return callbackError(request);
      response.cookies.set(PASSWORD_FLOW_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 60,
      });
    }

    return response;
  } catch {
    return callbackError(request);
  }
}
