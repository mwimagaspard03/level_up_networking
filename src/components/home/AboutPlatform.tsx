import Container from "../ui/Container";
import SectionTitle from "../ui/SectionTitle";

const principles = [
  "Des ressources accessibles gratuitement",
  "Un apprentissage progressif et pratique",
  "Une communauté tournée vers le partage",
];

export default function AboutPlatform() {
  return (
    <section className="section" id="apropos" aria-labelledby="about-title">
      <Container className="about-layout">
        <div className="about-visual" aria-hidden="true">
          <div className="about-panel">
            <small>OUR PRINCIPLE</small>
            <strong>
              KNOWLEDGE
              <br />
              <em>SHOULD</em>
              <br />
              CONNECT US.
            </strong>
            <small>LEARN TOGETHER · GROW TOGETHER</small>
          </div>
          <span className="free-stamp">
            100%
            <small>FREE</small>
          </span>
        </div>
        <div>
          <SectionTitle
            titleId="about-title"
            eyebrow="UNE COMMUNAUTÉ QUI PARTAGE"
            title="Le savoir réseau doit être accessible à tous."
            description="NETWORKING LEVEL UP est une plateforme d’apprentissage dédiée aux réseaux informatiques. Elle rassemble des ressources, des cours et des exercices pour aider chacun à développer ses compétences."
          />
          <ul className="check-list">
            {principles.map((principle) => (
              <li key={principle}>
                <span aria-hidden="true">✓</span> {principle}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
