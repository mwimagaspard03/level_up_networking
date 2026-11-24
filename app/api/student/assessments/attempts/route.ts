import { NextRequest, NextResponse } from 'next/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import { hasSameOrigin, isValidUuid, readJsonObject } from '@/src/lib/auth/request';
import { parsePublicAssessmentQuestions, parseStudentAnswers } from '@/src/lib/assessments/validation';

const privateHeaders = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 });
  const { client, profile } = await getRequestIdentity();
  if (!profile || profile.role !== 'STUDENT') return NextResponse.json({ error: 'Réservé aux étudiants.' }, { status: 403 });
  const assessmentId = request.nextUrl.searchParams.get('assessment_id');
  if (!isValidUuid(assessmentId)) return NextResponse.json({ error: 'Évaluation invalide.' }, { status: 400 });
  const { data, error } = await client
    .from('assessment_attempts')
    .select('id,answers,score,feedback,submitted_at')
    .eq('assessment_id', assessmentId)
    .eq('user_id', profile.id)
    .order('submitted_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Chargement impossible.' }, { status: 500, headers: privateHeaders });
  return NextResponse.json({ attempts: data ?? [] }, { headers: privateHeaders });
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 });
  const { client, profile } = await getRequestIdentity();
  if (!profile || profile.role !== 'STUDENT') return NextResponse.json({ error: 'Réservé aux étudiants.' }, { status: 403 });
  const body = await readJsonObject(request);
  if (!body || !isValidUuid(body.assessment_id)) return NextResponse.json({ error: 'Évaluation invalide.' }, { status: 400 });

  const { data: assessment, error: assessmentError } = await client
    .from('assessments')
    .select('id,questions')
    .eq('id', body.assessment_id)
    .eq('status', 'published')
    .maybeSingle();
  if (assessmentError || !assessment) return NextResponse.json({ error: 'Évaluation indisponible.' }, { status: 404 });
  const questions = parsePublicAssessmentQuestions(assessment.questions);
  if (!questions) return NextResponse.json({ error: 'Structure de l’évaluation invalide.' }, { status: 400 });
  const answers = parseStudentAnswers(questions, body.answers);
  if (!answers) return NextResponse.json({ error: 'Réponses invalides ou incomplètes.' }, { status: 400 });

  const { data, error } = await client.from('assessment_attempts').insert({
    assessment_id: assessment.id,
    user_id: profile.id,
    answers,
  }).select('id,submitted_at').single();
  if (error || !data) return NextResponse.json({ error: 'La tentative n’a pas pu être enregistrée.' }, { status: 400, headers: privateHeaders });
  return NextResponse.json({ attempt: data, message: 'Réponses envoyées pour correction manuelle.' }, { status: 201, headers: privateHeaders });
}
