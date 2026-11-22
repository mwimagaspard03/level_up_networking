import type { ReactNode } from 'react';
import Link from 'next/link';
import BrandName from '@/src/components/branding/BrandName';
import Container from '@/src/components/ui/Container';

type AuthFrameProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export default function AuthFrame({
  eyebrow,
  title,
  description,
  children,
}: AuthFrameProps) {
  return (
    <div className="auth-page">
      <header className="auth-site-header">
        <Container className="auth-site-header__inner">
          <BrandName />
          <Link className="button button--ghost button--small" href="/">
            Retour à l’accueil
          </Link>
        </Container>
      </header>
      <main className="auth-main">
        <Container className="auth-main__inner">
          <section className="auth-card" aria-labelledby="auth-title">
            <p className="eyebrow">{eyebrow}</p>
            <h1 id="auth-title">{title}</h1>
            <p className="auth-card__description">{description}</p>
            {children}
          </section>
        </Container>
      </main>
      <footer className="auth-footer">
        <Container className="auth-footer__inner">
          <span>LEARN · CONNECT · BUILD · GROW</span>
          <Link className="text-link" href="/courses">
            Parcourir le catalogue <span aria-hidden="true">→</span>
          </Link>
        </Container>
      </footer>
    </div>
  );
}
