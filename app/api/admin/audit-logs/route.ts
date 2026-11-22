import { NextResponse, type NextRequest } from 'next/server';
import { getRequestIdentity } from '@/src/lib/auth/server';

export async function GET(request: NextRequest) {
  try {
    const identity = await getRequestIdentity();
    if (!identity.profile || identity.profile.role !== 'OWNER') {
      return NextResponse.json(
        { message: 'Journal réservé au propriétaire.' },
        { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const requestedLimit = Number(request.nextUrl.searchParams.get('limit') ?? '50');
    const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 50;
    const { data, error } = await identity.client
      .from('account_audit_logs')
      .select('id, actor_user_id, target_user_id, target_email, action, details, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { message: 'Le journal d’audit est temporairement indisponible.' },
        { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    return NextResponse.json(
      { events: data ?? [] },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json(
      { message: 'Le service d’administration n’est pas encore configuré.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
