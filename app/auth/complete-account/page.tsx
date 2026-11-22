import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import AuthFrame from '@/src/components/auth/AuthFrame';
import PasswordUpdateForm from '@/src/components/auth/PasswordUpdateForm';
import { PASSWORD_FLOW_COOKIE, verifyPasswordFlowToken } from '@/src/lib/auth/password-flow';
import { getRequestIdentity } from '@/src/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function CompleteAccountPage() {
  let profile;
  try {
    ({ profile } = await getRequestIdentity());
  } catch {
    return (
      <AuthFrame
        eyebrow="INVITATION"
        title="Service indisponible"
        description="La configuration d’authentification n’est pas encore disponible."
      >
        <p className="auth-message auth-message--error">Réessayez plus tard ou contactez l’équipe.</p>
        <p className="auth-secondary-link"><Link href="/login">Retour à la connexion</Link></p>
      </AuthFrame>
    );
  }

  if (!profile) redirect('/login?next=%2Fauth%2Fcomplete-account');

  const cookieStore = await cookies();
  const flowToken = cookieStore.get(PASSWORD_FLOW_COOKIE)?.value;
  if (!verifyPasswordFlowToken(flowToken, 'invitation', profile.id)) {
    return (
      <AuthFrame
        eyebrow="INVITATION"
        title="Invitation invalide ou expirée"
        description="La finalisation nécessite une invitation récemment validée pour ce compte."
      >
        <p className="auth-secondary-link"><Link href="/login">Retour à la connexion</Link></p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      eyebrow="INVITATION"
      title="Finaliser votre compte"
      description="Choisissez votre mot de passe pour terminer l’accès à NETWORKING LEVEL UP."
    >
      <PasswordUpdateForm flow="invitation" />
    </AuthFrame>
  );
}
