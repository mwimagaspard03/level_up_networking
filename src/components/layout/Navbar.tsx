import Link from "next/link";
import BrandName from "../branding/BrandName";
import Container from "../ui/Container";

const navigation = [
  ["Accueil", "#accueil"],
  ["Nos cours", "#cours"],
  ["Domaines", "#domaines"],
  ["À propos", "#apropos"],
] as const;

export default function Navbar() {
  return (
    <header className="site-header">
      <Container className="nav-inner">
        <BrandName />

        <nav className="nav-links" aria-label="Navigation principale">
          {navigation.map(([label, href]) => (
            <Link href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>

        <Link className="button button--small button--secondary nav-cta" href="/login">
          Connexion <span aria-hidden="true">↗</span>
        </Link>

        <details className="mobile-menu">
          <summary className="mobile-menu__toggle">
            <span>Menu</span>
            <span className="mobile-menu__icon" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </summary>
          <nav className="mobile-menu__panel" aria-label="Navigation mobile">
            {navigation.map(([label, href]) => (
              <Link href={href} key={href}>
                {label}
              </Link>
            ))}
            <Link className="mobile-menu__login" href="/login">
              Connexion <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        </details>
      </Container>
    </header>
  );
}
