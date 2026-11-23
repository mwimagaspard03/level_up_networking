import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import Container from '@/src/components/ui/Container';
import { createSupabaseServerClient } from '@/src/lib/supabase/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import LessonCompleteButton from '@/src/components/dashboard/LessonCompleteButton';

export const dynamic = 'force-dynamic';

export default async function LessonPage({ params }: { params: Promise<{ slug: string; lessonSlug: string }> }) {
  const { slug, lessonSlug } = await params;
  const db = await createSupabaseServerClient();
  const { data: course } = await db.from('courses').select('id,title').eq('slug', slug).eq('status', 'published').maybeSingle();
  if (!course) notFound();

  const identity = await getRequestIdentity();
  if (!identity.profile || identity.profile.role !== 'STUDENT') redirect('/login');
  const { data: enrollment } = await db.from('enrollments').select('id')
    .eq('course_id', course.id).eq('user_id', identity.profile.id).maybeSingle();
  if (!enrollment) redirect(`/courses/${slug}`);

  const { data: lesson } = await db.from('lessons').select('id,title,content,sort_order')
    .eq('course_id', course.id).eq('slug', lessonSlug).eq('status', 'published').maybeSingle();
  if (!lesson) notFound();
  const { data: progress } = await db.from('lesson_progress').select('completed_at')
    .eq('user_id', identity.profile.id).eq('lesson_id', lesson.id).maybeSingle();

  const lines: string[] = (typeof lesson.content === 'string' ? lesson.content : '').split('\n');
  return (
    <main className="route-main">
      <Container>
        <p className="eyebrow">{course.title}</p>
        <h1 className="route-title">{lesson.title}</h1>
        <article className="lesson-content">{lines.map((line: string, index: number) => <p key={index}>{line || '\u00a0'}</p>)}</article>
        <LessonCompleteButton lessonId={lesson.id} completed={Boolean(progress?.completed_at)} />
        <p className="route-back-link"><Link href={`/courses/${slug}`}>← Retour au cours</Link></p>
      </Container>
    </main>
  );
}
