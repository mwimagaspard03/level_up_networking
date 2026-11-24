import Link from 'next/link';
import { notFound } from 'next/navigation';
import Container from '@/src/components/ui/Container';
import { createSupabaseServerClient } from '@/src/lib/supabase/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import EnrollButton from '@/src/components/dashboard/EnrollButton';
import AssessmentTaker from '@/src/components/dashboard/AssessmentTaker';
import { parsePublicAssessmentQuestions, type AssessmentQuestion } from '@/src/lib/assessments/validation';

export const dynamic = 'force-dynamic';

type PublicAssessment = { id: string; title: string; instructions: string; questions: AssessmentQuestion[] };

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await createSupabaseServerClient();
  const { data: course } = await db.from('courses').select('id,title,description,slug').eq('slug', slug).eq('status', 'published').maybeSingle();
  if (!course) notFound();

  const { data: lessons } = await db.from('lessons').select('id,title,slug,sort_order')
    .eq('course_id', course.id).eq('status', 'published').order('sort_order');
  const identity = await getRequestIdentity();
  let enrolled = false;
  let assessments: PublicAssessment[] = [];

  if (identity.profile?.role === 'STUDENT') {
    const { data: enrollment } = await db.from('enrollments').select('id')
      .eq('course_id', course.id).eq('user_id', identity.profile.id).maybeSingle();
    enrolled = Boolean(enrollment);
    if (enrolled) {
      try {
        const { data } = await db.from('assessments')
          .select('id,title,instructions,questions')
          .eq('course_id', course.id)
          .eq('status', 'published')
          .order('created_at', { ascending: false });
        assessments = (data ?? []).flatMap((assessment) => {
          const questions = parsePublicAssessmentQuestions(assessment.questions);
          return questions
            ? [{ id: assessment.id, title: assessment.title, instructions: assessment.instructions, questions }]
            : [];
        });
      } catch {
        assessments = [];
      }
    }
  }

  return (
    <main className="route-main">
      <Container>
        <p className="eyebrow">PARCOURS DE FORMATION</p>
        <h1 className="route-title">{course.title}</h1>
        {course.description && <p className="route-lead">{course.description}</p>}
        {identity.profile?.role === 'STUDENT' && !enrolled && <EnrollButton courseId={course.id} />}
        <div className="management-card">
          <h2>Leçons</h2>
          {(lessons ?? []).map((lesson, index) => (
            <article className="management-row" key={lesson.id}>
              <b>{index + 1}. {lesson.title}</b>
              {enrolled ? <Link className="text-link" href={`/courses/${slug}/${lesson.slug}`}>Ouvrir →</Link> : <span className="management-muted">Inscription requise</span>}
            </article>
          ))}
          {!lessons?.length && <p className="management-muted">Aucune leçon publiée pour le moment.</p>}
        </div>
        {enrolled && assessments.length > 0 && <section className="management-card assessment-list">
          <p className="eyebrow">ÉVALUATIONS</p>
          <h2>Évaluer mes acquis</h2>
          {assessments.map((assessment) => <AssessmentTaker key={assessment.id} assessment={assessment} />)}
        </section>}
        <p className="route-back-link"><Link href="/courses">← Retour au catalogue</Link></p>
      </Container>
    </main>
  );
}
