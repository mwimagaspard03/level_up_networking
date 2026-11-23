import { NextRequest, NextResponse } from 'next/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import { hasSameOrigin, isValidUuid, readJsonObject } from '@/src/lib/auth/request';
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

  const { data: course } = await client.from('courses').select('id').eq('id', body.course_id).maybeSingle();
  if (!course) return NextResponse.json({ error: 'Cours introuvable.' }, { status: 404 });
  if (lessonId) {
    const { data: lesson } = await client.from('lessons').select('id').eq('id', lessonId).eq('course_id', body.course_id).maybeSingle();
    if (!lesson) return NextResponse.json({ error: 'Leçon invalide pour ce cours.' }, { status: 400 });
  }

  const { data: assessment, error } = await client
    .from('assessments')
    .insert({
      course_id: body.course_id,
      lesson_id: lessonId,
      title,
      instructions: body.instructions.trim(),
      questions: definition.questions,
      status: 'draft',
      created_by: profile.id,
    })
    .select('id')
    .single();
  if (error || !assessment) return NextResponse.json({ error: 'Création impossible.' }, { status: 400 });

  const { error: keyError } = await client.from('assessment_answer_keys').insert({
    assessment_id: assessment.id,
    answers: definition.answerKey,
  });
  if (keyError) {
    await client.from('assessments').delete().eq('id', assessment.id);
    return NextResponse.json({ error: 'La clé privée n’a pas pu être enregistrée.' }, { status: 500, headers: privateHeaders });
  }
  return NextResponse.json({ id: assessment.id }, { status: 201, headers: privateHeaders });
}
