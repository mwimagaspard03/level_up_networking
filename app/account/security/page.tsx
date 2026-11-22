import Link from 'next/link';
import { redirect } from 'next/navigation';
import AuthFrame from '@/src/components/auth/AuthFrame';
import PasswordUpdateForm from '@/src/components/auth/PasswordUpdateForm';
import { getRequestIdentity } from '@/src/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function AccountSecurityPage() {
  let profile;
  try {
    ({ profile } = await getRequestIdentity());
  } catch {
    return (
      <AuthFrame
        eyebrow="SÉCURITÉ DU COMPTE"
        title="Service indisponible"
        description="La configuration d’authentification n’est pas encore disponible."
      >
        <p className="auth-message auth-message--error">Réessayez plus tard ou contactez l’équipe.</p>
        <p className="auth-secondary-link"><Link href="/dashboard">Retour à votre espace</Link></p>
      </AuthFrame>
    );
  }

  if (!profile) redirect('/login?next=%2Faccount%2Fsecurity');

  return (
    <AuthFrame
      eyebrow="SÉCURITÉ DU COMPTE"
      title="Changer mon mot de passe"
      description="Vous êtes connecté : choisissez un nouveau mot de passe sans demander de lien de récupération."
    >
      <PasswordUpdateForm flow="account" />
      <p className="auth-secondary-link"><Link href="/dashboard">Retour à votre espace</Link></p>
    </AuthFrame>
  );
}
