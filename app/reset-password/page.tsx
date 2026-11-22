import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import AuthFrame from '@/src/components/auth/AuthFrame';
import PasswordUpdateForm from '@/src/components/auth/PasswordUpdateForm';
import { PASSWORD_FLOW_COOKIE, verifyPasswordFlowToken } from '@/src/lib/auth/password-flow';
import { createSupabaseServerClient } from '@/src/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage() {
  let subject: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    if (!error && typeof data?.claims?.sub === 'string') subject = data.claims.sub;
  } catch {
    return (
      <AuthFrame
        eyebrow="RÉCUPÉRATION SÉCURISÉE"
        title="Service indisponible"
        description="La configuration d’authentification n’est pas encore disponible."
      >
        <p className="auth-message auth-message--error">Réessayez plus tard ou contactez l’équipe.</p>
        <p className="auth-secondary-link"><Link href="/login">Retour à la connexion</Link></p>
      </AuthFrame>
    );
  }

  if (!subject) redirect('/login?next=%2Freset-password');

  const cookieStore = await cookies();
  const flowToken = cookieStore.get(PASSWORD_FLOW_COOKIE)?.value;
  if (!verifyPasswordFlowToken(flowToken, 'recovery', subject)) {
    return (
      <AuthFrame
        eyebrow="RÉCUPÉRATION SÉCURISÉE"
        title="Lien invalide ou expiré"
        description="Pour protéger votre compte, cette page nécessite un lien de récupération récemment validé."
      >
        <p className="auth-secondary-link"><Link href="/forgot-password">Demander un nouveau lien</Link></p>
        <p className="auth-secondary-link"><Link href="/login">Retour à la connexion</Link></p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      eyebrow="RÉCUPÉRATION SÉCURISÉE"
      title="Choisir un nouveau mot de passe"
      description="Utilisez au moins 12 caractères. Ce parcours est réservé à un lien de récupération validé."
    >
      <PasswordUpdateForm flow="recovery" />
    </AuthFrame>
  );
}
