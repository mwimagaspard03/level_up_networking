'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type PasswordUpdateFlow = 'account' | 'recovery' | 'invitation';
type PasswordUpdateFormProps = { flow: PasswordUpdateFlow };

export default function PasswordUpdateForm({ flow }: PasswordUpdateFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setSuccess(false);

    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirmation = String(form.get('password-confirmation') ?? '');

    if (password.length < 12) {
      setMessage('Choisissez un mot de passe d’au moins 12 caractères.');
      return;
    }
    if (password !== confirmation) {
      setMessage('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setPending(true);
    try {
      const response = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, flow }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(result.message ?? 'Le mot de passe n’a pas pu être mis à jour.');
        return;
      }
      setSuccess(true);
      setMessage('Mot de passe enregistré. Redirection vers votre espace…');
      router.push('/dashboard');
    } catch {
      setMessage('Le service est temporairement indisponible. Réessayez plus tard.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label htmlFor="new-password">Nouveau mot de passe</label>
      <input
        className="auth-input"
        id="new-password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
        required
      />
      <label htmlFor="password-confirmation">Confirmer le mot de passe</label>
      <input
        className="auth-input"
        id="password-confirmation"
        name="password-confirmation"
        type="password"
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
        required
      />
      {message ? (
        <p className={`auth-message${success ? ' auth-message--success' : ' auth-message--error'}`} role={success ? 'status' : 'alert'}>
          {message}
        </p>
      ) : null}
      <button className="button button--primary auth-submit" type="submit" disabled={pending}>
        {pending
          ? 'Enregistrement…'
          : flow === 'invitation'
            ? 'Activer mon compte'
            : flow === 'recovery'
              ? 'Réinitialiser le mot de passe'
              : 'Enregistrer le nouveau mot de passe'}
      </button>
    </form>
  );
}
