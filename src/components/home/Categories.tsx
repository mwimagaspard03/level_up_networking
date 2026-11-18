import Container from "../ui/Container";
import SectionTitle from "../ui/SectionTitle";

const categories = [
  {
    number: "01",
    title: "Fondamentaux réseau",
    description: "Comprendre les bases et les architectures.",
    symbol: "⌘",
  },
  {
    number: "02",
    title: "IPv4 & Subnetting",
    description: "Maîtriser l’adressage et le découpage réseau.",
    symbol: "⌗",
  },
  {
    number: "03",
    title: "IPv6",
    description: "Découvrir la nouvelle génération d’adressage.",
    symbol: "◎",
  },
  {
    number: "04",
    title: "Switching",
    description: "Connecter les équipements avec méthode.",
    symbol: "⇄",
  },
  {
    number: "05",
    title: "Routing",
    description: "Faire communiquer les réseaux entre eux.",
    symbol: "⌁",
  },
  {
    number: "06",
    title: "Packet Tracer",
    description: "Pratiquer avec des laboratoires simulés.",
    symbol: "▱",
  },
];

export default function Categories() {
  return (
    <section className="section" id="domaines" aria-labelledby="domains-title">
      <Container>
        <SectionTitle
          titleId="domains-title"
          eyebrow="TON PARCOURS, TON RYTHME"
          title="Explore les domaines du réseau"
          description="Des notions essentielles aux mises en pratique, avance étape par étape."
        />
        <div className="category-grid">
          {categories.map((category) => (
            <article className="category-card" key={category.number}>
              <div className="category-top">
                <span>{category.number} / 06</span>
                <span className="category-symbol" aria-hidden="true">
                  {category.symbol}
                </span>
              </div>
              <h3>{category.title}</h3>
              <p>{category.description}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
