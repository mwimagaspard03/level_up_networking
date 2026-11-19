import AboutPlatform from "@/src/components/home/AboutPlatform";
import CallToAction from "@/src/components/home/CallToAction";
import Categories from "@/src/components/home/Categories";
import FeaturedCourses from "@/src/components/home/FeaturedCourses";
import Hero from "@/src/components/home/Hero";
import Footer from "@/src/components/layout/Footer";
import Navbar from "@/src/components/layout/Navbar";

export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Passer au contenu principal
      </a>
      <Navbar />
      <main id="main-content">
        <Hero />
        <Categories />
        <FeaturedCourses />
        <AboutPlatform />
        <CallToAction />
      </main>
      <Footer />
    </>
  );
}
