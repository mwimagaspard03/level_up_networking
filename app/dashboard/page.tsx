import Link from 'next/link';
import { redirect } from 'next/navigation';
import Container from '@/src/components/ui/Container';
import { getRequestIdentity } from '@/src/lib/auth/server';

export const dynamic = 'force-dynamic';

const roleNames = {
  OWNER: 'Propriétaire',
  ADMIN: 'Administration',
  STUDENT: 'Étudiant',
} as const;

export default async function DashboardPage() {
  let identity;
  try {
    identity = await getRequestIdentity();
  } catch {
    return (
      <main className="route-main">
        <Container>
          <section className="route-notice" role="status">
            <h1>Connexion indisponible</h1>
            <p>La configuration d’authentification n’est pas encore disponible.</p>
            <Link className="button button--secondary" href="/login">Retour à la connexion</Link>
          </section>
        </Container>
      </main>
    );
  }

  if (!identity.profile) redirect('/login?next=%2Fdashboard');

  const { profile } = identity;
  return (
    <main className="dashboard-page">
      <header className="site-header">
        <Container className="dashboard-header">
          <Link className="brand-name" href="/" aria-label="NETWORKING LEVEL UP, accueil">
            <span className="brand-main">NETWORKING <b>LEVEL UP</b></span>
            <span className="brand-tag">LEARN <i>•</i> CONNECT <i>•</i> BUILD <i>•</i> GROW</span>
          </Link>
          <div className="dashboard-header__actions">
            <Link className="button button--ghost button--small" href="/courses">Nos cours</Link>
            <form action="/auth/logout" method="post">
              <button className="button button--secondary button--small" type="submit">Déconnexion</button>
            </form>
          </div>
        </Container>
      </header>
      <Container className="dashboard-main">
        <p className="eyebrow">ESPACE MEMBRE · {roleNames[profile.role].toUpperCase()}</p>
        <h1 className="route-title">
          {profile.display_name ? `Bonjour, ${profile.display_name}` : 'Votre espace de formation'}
        </h1>
        <p className="route-lead">Votre compte est connecté avec le rôle {roleNames[profile.role]}.</p>
        <section className="dashboard-panel" aria-labelledby="dashboard-courses-title">
          <div>
            <p className="eyebrow">PROCHAINE ÉTAPE</p>
            <h2 id="dashboard-courses-title">Continuez à apprendre</h2>
            <p>Parcourez le catalogue public pour découvrir les cours de réseaux disponibles.</p>
          </div>
          <Link className="button button--primary" href="/courses">Voir le catalogue</Link>
        </section>
        <section className="dashboard-panel" aria-labelledby="dashboard-security-title">
          <div>
            <p className="eyebrow">VOTRE COMPTE</p>
            <h2 id="dashboard-security-title">Sécurité du compte</h2>
            <p>Modifiez votre mot de passe depuis votre session, sans demander de lien de récupération.</p>
          </div>
          <Link className="button button--secondary" href="/account/security">Changer mon mot de passe</Link>
        </section>
        <p className="dashboard-footnote">Les outils avancés par rôle seront ajoutés dans les prochains lots.</p>
      </Container>
    </main>
  );
}
