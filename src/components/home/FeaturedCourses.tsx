import Link from "next/link";
import Container from "../ui/Container";
import SectionTitle from "../ui/SectionTitle";

const courses = [
  {
    level: "DÉBUTANT",
    title: "Les bases des réseaux informatiques",
    detail: "Fondamentaux · 6 leçons",
    code: "NET / 01",
    visualTitle: "NETWORK\nLEARNING",
    symbol: "◎",
  },
  {
    level: "PRATIQUE",
    title: "IPv4 et subnetting pas à pas",
    detail: "Adressage IP · 8 leçons",
    code: "IP / 02",
    visualTitle: "IP\nADDRESSING",
    symbol: "⌗",
  },
  {
    level: "LABORATOIRE",
    title: "Premiers pas avec Packet Tracer",
    detail: "Simulation · 5 leçons",
    code: "LAB / 03",
    visualTitle: "NETWORK\nLAB",
    symbol: "⌁",
  },
];

export default function FeaturedCourses() {
  return (
    <section className="section section-alt" id="cours" aria-labelledby="courses-title">
      <Container>
        <SectionTitle
          titleId="courses-title"
          eyebrow="APPRENDS EN FAISANT"
          title="Commence par les essentiels"
          description="Un aperçu des parcours qui seront disponibles sur la plateforme."
        />
        <div className="course-grid">
          {courses.map((course, index) => (
            <article className="course-card" key={course.code}>
              <div
                className={`course-visual visual-${index}`}
                aria-hidden="true"
              >
                <span className="course-code">{course.code}</span>
                <b>{course.visualTitle}</b>
                <i>{course.symbol}</i>
              </div>
              <div className="course-content">
                <small>{course.level}</small>
                <h3>{course.title}</h3>
                <p>{course.detail}</p>
                <Link className="text-link" href="/courses">
                  Découvrir le parcours <span aria-hidden="true">→</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
