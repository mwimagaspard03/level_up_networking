import { NextRequest, NextResponse } from 'next/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import { hasSameOrigin, isValidUuid, readJsonObject } from '@/src/lib/auth/request';
import { assessmentRpcErrorStatus } from '@/src/lib/assessments/rpc-error';
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

  const { data: course, error: courseError } = await client.from('courses').select('id').eq('id', body.course_id).maybeSingle();
  if (courseError) {
    const status = courseError.code === '42501' ? 403 : 500;
    return NextResponse.json({ error: 'Vérification du cours impossible.' }, { status, headers: privateHeaders });
  }
  if (!course) return NextResponse.json({ error: 'Cours introuvable.' }, { status: 404 });
  if (lessonId) {
    const { data: lesson, error: lessonError } = await client.from('lessons').select('id').eq('id', lessonId).eq('course_id', body.course_id).maybeSingle();
    if (lessonError) {
      const status = lessonError.code === '42501' ? 403 : 500;
      return NextResponse.json({ error: 'Vérification de la leçon impossible.' }, { status, headers: privateHeaders });
    }
    if (!lesson) return NextResponse.json({ error: 'Leçon invalide pour ce cours.' }, { status: 400 });
  }

  const { error } = await client.rpc('save_assessment_definition', {
    p_assessment_id: assessmentId,
    p_course_id: body.course_id,
    p_lesson_id: lessonId,
    p_title: body.title.trim(),
    p_instructions: body.instructions.trim(),
    p_questions: definition.questions,
    p_status: body.status,
    p_answers: definition.answerKey,
  });
  if (error) {
    return NextResponse.json(
      { error: 'Modification impossible.' },
      { status: assessmentRpcErrorStatus(error.code), headers: privateHeaders },
    );
  }
  return NextResponse.json({ ok: true }, { headers: privateHeaders });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 });
  const { assessmentId } = await params;
  if (!isValidUuid(assessmentId)) return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 });
  const { client, profile } = await getRequestIdentity();
  if (!profile || !isStaff(profile.role)) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  const { data: deletedAssessment, error } = await client
    .from('assessments')
    .delete()
    .eq('id', assessmentId)
    .select('id')
    .maybeSingle();
  if (error) {
    const status = error.code === '42501' ? 403 : 500;
    return NextResponse.json({ error: 'Suppression impossible.' }, { status, headers: privateHeaders });
  }
  if (!deletedAssessment) return NextResponse.json({ error: 'Évaluation introuvable.' }, { status: 404, headers: privateHeaders });
  return NextResponse.json({ ok: true }, { headers: privateHeaders });
}
