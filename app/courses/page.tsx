import Link from 'next/link';
import RouteHeader from '@/src/components/layout/RouteHeader';
import Container from '@/src/components/ui/Container';
import { createSupabaseServerClient } from '@/src/lib/supabase/server';

export const dynamic = 'force-dynamic';

const categoryLabels: Record<string, string> = {
  networking_fundamentals: 'Fondamentaux réseau',
  ipv4_subnetting: 'IPv4 et subnetting',
  ipv6: 'IPv6',
  switching: 'Commutation',
  routing: 'Routage',
  packet_tracer: 'Packet Tracer',
};

type Course = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string;
};

export default async function CoursesPage() {
  let courses: Course[] = [];
  let unavailable = false;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('courses')
      .select('id, title, slug, description, category')
      .eq('status', 'published')
      .order('created_at', { ascending: false });
    if (error) unavailable = true;
    else courses = (data ?? []) as Course[];
  } catch {
    unavailable = true;
  }

  return (
    <>
      <RouteHeader />
      <main className="route-main">
        <Container>
          <p className="eyebrow">CATALOGUE PUBLIC</p>
          <h1 className="route-title">Cours de réseaux informatiques</h1>
          <p className="route-lead">Des parcours accessibles et pratiques, toujours 100 % gratuits.</p>
          {unavailable ? (
            <section className="route-notice" role="status"><h2>Catalogue temporairement indisponible</h2><p>Le catalogue n’est pas encore configuré. Revenez bientôt.</p></section>
          ) : courses.length === 0 ? (
            <section className="route-notice" role="status"><h2>Les premiers cours arrivent</h2><p>Aucun cours publié n’est disponible pour le moment.</p></section>
          ) : (
            <div className="course-catalog-grid">
              {courses.map((course) => (
                <article className="course-card" key={course.id}>
                  <div className="course-visual"><span className="course-code">NETWORK / COURSE</span><b>{categoryLabels[course.category] ?? 'Réseaux informatiques'}</b><i aria-hidden="true">⌁</i></div>
                  <div className="course-content">
                    <small>{categoryLabels[course.category] ?? 'RÉSEAUX'}</small>
                    <h2>{course.title}</h2>
                    <p>{course.description || 'Un parcours pour développer vos compétences réseau.'}</p>
                    <Link className="text-link" href={`/courses/${course.slug}`}>Découvrir le parcours <span aria-hidden="true">→</span></Link>
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="route-back-link"><Link href="/">Retour à l’accueil</Link></p>
        </Container>
      </main>
    </>
  );
}
