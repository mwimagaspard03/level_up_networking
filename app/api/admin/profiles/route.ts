import { NextRequest, NextResponse } from 'next/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import { hasSameOrigin } from '@/src/lib/auth/request';

export async function GET(request: NextRequest) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 });
  const { client, profile } = await getRequestIdentity();
  if (!profile || !['OWNER', 'ADMIN'].includes(profile.role)) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  const term = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80);
  let query = client.from('profiles').select('id, display_name, role, created_at').order('created_at', { ascending: false }).limit(100);
  if (profile.role === 'ADMIN') query = query.eq('role', 'STUDENT');
  if (term) query = query.ilike('display_name', `%${term.replace(/[%_,]/g, '')}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Impossible de charger les membres.' }, { status: 500 });
  return NextResponse.json({ profiles: data ?? [] });
}
