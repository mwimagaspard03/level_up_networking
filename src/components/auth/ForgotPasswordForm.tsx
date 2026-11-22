'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

export default function ForgotPasswordForm() {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = (await response.json()) as { message?: string };
      setMessage(
        result.message ??
          'Si un compte correspond à cette adresse et si l’envoi est disponible, des instructions seront transmises.',
      );
      if (!response.ok) {
        setMessage('La demande ne peut pas être traitée pour le moment. Réessayez plus tard.');
      }
    } catch {
      setMessage('Le service est temporairement indisponible. Réessayez plus tard.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="recovery-email">Adresse e-mail</label>
        <input
          className="auth-input"
          id="recovery-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
        {message ? <p className="auth-message" role="status">{message}</p> : null}
        <button className="button button--primary auth-submit" type="submit" disabled={pending}>
          {pending ? 'Envoi…' : 'Demander les instructions'}
        </button>
      </form>
      <p className="auth-secondary-link"><Link href="/login">Retour à la connexion</Link></p>
    </>
  );
}
