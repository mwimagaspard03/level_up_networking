'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { safeInternalPath } from '@/src/lib/auth/redirect';

type LoginFormProps = { callbackError?: boolean };

export default function LoginForm({ callbackError = false }: LoginFormProps) {
  const [message, setMessage] = useState(
    callbackError ? 'Ce lien de connexion n’est plus valide. Demandez-en un nouveau.' : '',
  );
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(result.message ?? 'Connexion impossible. Vérifiez vos identifiants.');
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const next = safeInternalPath(params.get('next'));
      window.location.assign(next);
    } catch {
      setMessage('Le service est temporairement indisponible. Réessayez plus tard.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="login-email">Adresse e-mail</label>
        <input
          className="auth-input"
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
        <label htmlFor="login-password">Mot de passe</label>
        <input
          className="auth-input"
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
        {message ? <p className="auth-message auth-message--error" role="alert">{message}</p> : null}
        <button className="button button--primary auth-submit" type="submit" disabled={pending}>
          {pending ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <p className="auth-secondary-link">
        Mot de passe oublié ? <Link href="/forgot-password">Le réinitialiser</Link>
      </p>
      <p className="auth-note">Les comptes sont créés uniquement sur invitation. Il n’y a pas d’inscription publique.</p>
    </>
  );
}
