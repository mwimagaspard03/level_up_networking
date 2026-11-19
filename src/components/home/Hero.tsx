import Button from "../ui/Button";
import Container from "../ui/Container";

const networkNodes = ["ROUTER", "SWITCH", "SERVER", "CLIENT"];

export default function Hero() {
  return (
    <section className="hero" id="accueil" aria-labelledby="hero-title">
      <Container className="hero-layout">
        <div className="hero-copy">
          <span className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            APPRENDRE LES RÉSEAUX, SANS LIMITE
          </span>
          <h1 id="hero-title">
            Le réseau de demain commence <em>avec toi.</em>
          </h1>
          <p className="hero-description">
            Développe tes compétences en réseaux informatiques grâce à des cours
            accessibles, des ressources pratiques et une communauté qui progresse
            ensemble.
          </p>
          <div className="hero-actions">
            <Button href="/courses">
              Explorer les cours <span aria-hidden="true">→</span>
            </Button>
            <Button href="#apropos" variant="ghost">
              Découvrir la plateforme
            </Button>
          </div>
          <p className="hero-proof">
            <b>100 % GRATUIT</b> · Apprends à ton rythme. Construis tes compétences.
          </p>
        </div>

        <div
          className="network-art"
          role="img"
          aria-label="Illustration d’une topologie réseau connectant un routeur, un switch, un serveur et un client"
        >
          <span className="network-orbit network-orbit--one" aria-hidden="true" />
          <span className="network-orbit network-orbit--two" aria-hidden="true" />
          <span className="network-core" aria-hidden="true">
            <b>N</b>
            <small>NETWORK CORE</small>
          </span>
          {networkNodes.map((node, index) => (
            <div className={`network-node node-${index}`} key={node}>
              <span className="network-node__glyph" aria-hidden="true">
                ◇
              </span>
              <strong>{node}</strong>
              <small>CONNECTED</small>
            </div>
          ))}
        </div>
      </Container>

      <Container className="hero-bottom" aria-label="Notre signature">
        <span>01 / LEARN</span>
        <span>02 / CONNECT</span>
        <span>03 / BUILD</span>
        <span>04 / GROW</span>
      </Container>
    </section>
  );
}
