import { NextRequest, NextResponse } from 'next/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import { hasSameOrigin, isValidUuid, readJsonObject } from '@/src/lib/auth/request';
import { parseAssessmentDefinition } from '@/src/lib/assessments/validation';

const privateHeaders = { 'Cache-Control': 'private, no-store' };
const isStaff = (role: string | undefined) => role === 'OWNER' || role === 'ADMIN';

type RouteContext = { params: Promise<{ assessmentId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 });
  const { assessmentId } = await params;
  if (!isValidUuid(assessmentId)) return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 });
  const { client, profile } = await getRequestIdentity();
  if (!profile || !isStaff(profile.role)) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  const body = await readJsonObject(request);
  if (!body || !isValidUuid(body.course_id) || typeof body.title !== 'string' || typeof body.instructions !== 'string') {
    return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
  }
  const lessonId = body.lesson_id === undefined || body.lesson_id === null ? null : body.lesson_id;
  const definition = parseAssessmentDefinition(body.questions, body.answer_key);
  if (!definition || body.title.trim().length < 1 || body.title.trim().length > 160 || body.instructions.length > 2000 ||
      (lessonId !== null && !isValidUuid(lessonId)) || (body.status !== 'draft' && body.status !== 'published')) {
    return NextResponse.json({ error: 'Vérifiez les champs de l’évaluation.' }, { status: 400 });
  }

  const { data: course } = await client.from('courses').select('id').eq('id', body.course_id).maybeSingle();
  if (!course) return NextResponse.json({ error: 'Cours introuvable.' }, { status: 404 });
  if (lessonId) {
    const { data: lesson } = await client.from('lessons').select('id').eq('id', lessonId).eq('course_id', body.course_id).maybeSingle();
    if (!lesson) return NextResponse.json({ error: 'Leçon invalide pour ce cours.' }, { status: 400 });
  }

  const { error } = await client.from('assessments').update({
    course_id: body.course_id,
    lesson_id: lessonId,
    title: body.title.trim(),
    instructions: body.instructions.trim(),
    questions: definition.questions,
    status: body.status,
  }).eq('id', assessmentId);
  if (error) return NextResponse.json({ error: 'Modification impossible.' }, { status: 400 });
  const { error: keyError } = await client.from('assessment_answer_keys').upsert({
    assessment_id: assessmentId,
    answers: definition.answerKey,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'assessment_id' });
  if (keyError) return NextResponse.json({ error: 'La clé privée n’a pas pu être mise à jour.' }, { status: 500, headers: privateHeaders });
  return NextResponse.json({ ok: true }, { headers: privateHeaders });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 });
  const { assessmentId } = await params;
  if (!isValidUuid(assessmentId)) return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 });
  const { client, profile } = await getRequestIdentity();
  if (!profile || !isStaff(profile.role)) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  const { error } = await client.from('assessments').delete().eq('id', assessmentId);
  if (error) return NextResponse.json({ error: 'Suppression impossible.' }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: privateHeaders });
}
