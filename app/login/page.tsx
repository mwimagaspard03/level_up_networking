import AuthFrame from '@/src/components/auth/AuthFrame';
import LoginForm from '@/src/components/auth/LoginForm';

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  return (
    <AuthFrame
      eyebrow="ESPACE MEMBRE"
      title="Connexion"
      description="Retrouvez vos parcours et votre progression en réseaux informatiques."
    >
      <LoginForm callbackError={params.error === 'auth_callback'} />
    </AuthFrame>
  );
}
