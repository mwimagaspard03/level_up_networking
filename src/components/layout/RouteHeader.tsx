import Link from 'next/link';
import BrandName from '@/src/components/branding/BrandName';
import Container from '@/src/components/ui/Container';

export default function RouteHeader() {
  return (
    <header className="site-header">
      <Container className="route-header__inner">
        <BrandName />
        <nav className="route-header__links" aria-label="Navigation de la plateforme">
          <Link href="/">Accueil</Link>
          <Link href="/courses">Nos cours</Link>
          <Link className="button button--secondary button--small" href="/login">
            Connexion
          </Link>
        </nav>
      </Container>
    </header>
  );
}
