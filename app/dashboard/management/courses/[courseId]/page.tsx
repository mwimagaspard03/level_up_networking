import Link from 'next/link';
import { notFound } from 'next/navigation';
import Container from '@/src/components/ui/Container';
import AssessmentManager from '@/src/components/dashboard/AssessmentManager';
import LessonManager from '@/src/components/dashboard/LessonManager';
import { requireRole } from '@/src/lib/auth/guards';

export const dynamic = 'force-dynamic';

export default async function ManageCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { client } = await requireRole(['OWNER', 'ADMIN']);
  const { courseId } = await params;
  const { data: course } = await client.from('courses').select('id,title,slug,status').eq('id', courseId).maybeSingle();
  if (!course) notFound();
  const { data: lessonRows } = await client.from('lessons')
    .select('id,title,slug,content,status,sort_order')
    .eq('course_id', courseId)
    .order('sort_order');
  const lessons = lessonRows ?? [];
  const lessonOptions = lessons.map((lesson) => ({ id: lesson.id, title: lesson.title }));

  return (
    <main className="route-main">
      <Container>
        <p className="eyebrow">GESTION DU COURS</p>
        <h1 className="route-title">{course.title}</h1>
        <p className="route-lead">État : {course.status}</p>
        <section className="management-card">
          <LessonManager courseId={course.id} initial={lessons.map((lesson) => ({ ...lesson, content: lesson.content ?? '' }))} />
        </section>
        <AssessmentManager courseId={course.id} lessons={lessonOptions} />
        <p className="route-back-link"><Link href="/dashboard/management">← Retour à la gestion</Link></p>
      </Container>
    </main>
  );
}
