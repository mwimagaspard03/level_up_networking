import { NextRequest, NextResponse } from 'next/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import { hasSameOrigin, isValidUuid, readJsonObject } from '@/src/lib/auth/request';

const privateHeaders = { 'Cache-Control': 'private, no-store' };
type RouteContext = { params: Promise<{ assessmentId: string }> };
const isStaff = (role: string | undefined) => role === 'OWNER' || role === 'ADMIN';

export async function GET(request: NextRequest, { params }: RouteContext) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 });
  const { assessmentId } = await params;
  if (!isValidUuid(assessmentId)) return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 });
  const { client, profile } = await getRequestIdentity();
  if (!profile || !isStaff(profile.role)) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  const { data, error } = await client
    .from('assessment_attempts')
    .select('id,assessment_id,user_id,answers,score,feedback,submitted_at')
    .eq('assessment_id', assessmentId)
    .order('submitted_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Chargement des tentatives impossible.' }, { status: 500, headers: privateHeaders });
  return NextResponse.json({ attempts: data ?? [] }, { headers: privateHeaders });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 });
  const { assessmentId } = await params;
  if (!isValidUuid(assessmentId)) return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 });
  const { client, profile } = await getRequestIdentity();
  if (!profile || !isStaff(profile.role)) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  const body = await readJsonObject(request);
  if (!body || !isValidUuid(body.attempt_id) || typeof body.score !== 'number' || !Number.isFinite(body.score) ||
      body.score < 0 || body.score > 100 || typeof body.feedback !== 'string' || body.feedback.length > 2000) {
    return NextResponse.json({ error: 'Note ou commentaire invalide.' }, { status: 400 });
  }
  const { error } = await client.from('assessment_attempts').update({
    score: Math.round(body.score * 100) / 100,
    feedback: body.feedback.trim(),
  }).eq('id', body.attempt_id).eq('assessment_id', assessmentId);
  if (error) return NextResponse.json({ error: 'Correction impossible.' }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: privateHeaders });
}
