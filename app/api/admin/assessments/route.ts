import { NextRequest, NextResponse } from 'next/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import { hasSameOrigin, isValidUuid, readJsonObject } from '@/src/lib/auth/request';
import { assessmentRpcErrorStatus } from '@/src/lib/assessments/rpc-error';
import { parseAssessmentDefinition } from '@/src/lib/assessments/validation';

const privateHeaders = { 'Cache-Control': 'private, no-store' };

function staffRole(role: string | undefined) {
  return role === 'OWNER' || role === 'ADMIN';
}

export async function GET(request: NextRequest) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 });
  const { client, profile } = await getRequestIdentity();
  if (!profile || !staffRole(profile.role)) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  const courseId = request.nextUrl.searchParams.get('course_id');
  if (!isValidUuid(courseId)) return NextResponse.json({ error: 'Cours invalide.' }, { status: 400 });

  const { data: assessments, error } = await client
    .from('assessments')
    .select('id,course_id,lesson_id,title,instructions,questions,status,created_at')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Chargement impossible.' }, { status: 500, headers: privateHeaders });

  const ids = (assessments ?? []).map((assessment) => assessment.id);
  const { data: keys, error: keyError } = ids.length
    ? await client.from('assessment_answer_keys').select('assessment_id,answers').in('assessment_id', ids)
    : { data: [], error: null };
  if (keyError) return NextResponse.json({ error: 'Chargement des clés impossible.' }, { status: 500, headers: privateHeaders });

  const answerKeys = Object.fromEntries((keys ?? []).map((entry) => [entry.assessment_id, entry.answers]));
  return NextResponse.json({ assessments: assessments ?? [], answerKeys }, { headers: privateHeaders });
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 });
  const { client, profile } = await getRequestIdentity();
  if (!profile || !staffRole(profile.role)) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  const body = await readJsonObject(request);
  if (!body || !isValidUuid(body.course_id)) return NextResponse.json({ error: 'Cours invalide.' }, { status: 400 });
  if (typeof body.title !== 'string' || typeof body.instructions !== 'string' || body.instructions.length > 2000) {
    return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
  }
  const title = body.title.trim();
  const lessonId = body.lesson_id === undefined || body.lesson_id === null ? null : body.lesson_id;
  const definition = parseAssessmentDefinition(body.questions, body.answer_key);
  if (!title || title.length > 160 || (lessonId !== null && !isValidUuid(lessonId)) || !definition) {
    return NextResponse.json({ error: 'Vérifiez les questions et la clé de correction.' }, { status: 400 });
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

  const { data: assessmentId, error } = await client.rpc('save_assessment_definition', {
    p_assessment_id: null,
    p_course_id: body.course_id,
    p_lesson_id: lessonId,
    p_title: title,
    p_instructions: body.instructions.trim(),
    p_questions: definition.questions,
    p_status: 'draft',
    p_answers: definition.answerKey,
  });
  if (error || !assessmentId) {
    const status = error ? assessmentRpcErrorStatus(error.code) : 500;
    return NextResponse.json({ error: 'Création impossible.' }, { status, headers: privateHeaders });
  }
  return NextResponse.json({ id: assessmentId }, { status: 201, headers: privateHeaders });
}
