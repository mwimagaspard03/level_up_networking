import BrandName from "../branding/BrandName";
import Container from "../ui/Container";

export default function Footer() {
  return (
    <footer className="site-footer">
      <Container className="footer-inner">
        <BrandName />
        <p>Apprendre aujourd’hui, exceller demain.</p>
        <span>
          © {new Date().getFullYear()} NETWORKING LEVEL UP · 100 % GRATUIT
        </span>
      </Container>
    </footer>
  );
}
