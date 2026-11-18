import Button from "../ui/Button";
import Container from "../ui/Container";

export default function CallToAction() {
  return (
    <section className="cta-section" aria-labelledby="cta-title">
      <Container>
        <div className="cta-panel">
          <div>
            <span className="eyebrow">TON PROCHAIN NIVEAU COMMENCE ICI</span>
            <h2 id="cta-title">Prêt à faire évoluer tes compétences ?</h2>
            <p>Explore les cours et construis tes bases, une leçon à la fois.</p>
          </div>
          <Button href="/courses">
            Commencer à apprendre <span aria-hidden="true">→</span>
          </Button>
        </div>
      </Container>
    </section>
  );
}
