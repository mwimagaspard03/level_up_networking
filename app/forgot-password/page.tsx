import AuthFrame from '@/src/components/auth/AuthFrame';
import ForgotPasswordForm from '@/src/components/auth/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <AuthFrame
      eyebrow="RÉCUPÉRATION SÉCURISÉE"
      title="Mot de passe oublié ?"
      description="Indiquez l’adresse liée à votre compte. La réponse ne révélera pas si un compte existe."
    >
      <ForgotPasswordForm />
    </AuthFrame>
  );
}
