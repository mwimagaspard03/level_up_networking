import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NETWORKING LEVEL UP — Apprendre les réseaux, gratuitement",
  description:
    "Développe tes compétences en réseaux informatiques grâce à des cours accessibles et des ressources pratiques. Apprentissage 100 % gratuit.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
