# NETWORKING LEVEL UP

NETWORKING LEVEL UP est une application Next.js App Router en français, dédiée à l’apprentissage des réseaux informatiques. Le design system et la page d’accueil existants sont conservés. Ce lot ajoute les clients Supabase SSR, les parcours Auth V1, le catalogue public et une zone privée minimale.

## Stack

- Next.js 16, React 19 et TypeScript.
- Supabase Auth et accès aux données avec `@supabase/ssr` et `@supabase/supabase-js`.
- CSS du projet et tokens de marque existants; les nouveaux écrans réutilisent les couleurs Midnight, Navy, Gold, Electric Blue, Ice White et Steel Gray.

## Routes et flux livrés

Pages :

- `/login` — connexion e-mail/mot de passe, erreurs localisées et lien de récupération.
- `/account/security` — changement du mot de passe depuis le compte avec une session authentifiée, sans lien de récupération.
- `/forgot-password` et `/reset-password` — demande de lien de récupération à réponse non révélatrice, puis mise à jour après validation du lien de récupération.
- `/auth/callback` — échange du code PKCE ou validation des liens d’invitation/récupération.
- `/auth/complete-account` — choix du mot de passe après invitation.
- `/courses` — catalogue public limité aux cours publiés par les politiques d’accès.
- `/dashboard` — espace privé minimal affichant le rôle lu depuis `profiles`.

Endpoints serveur :

- `POST /api/auth/login`, `POST /api/auth/forgot-password`, `POST /api/auth/update-password` et `POST /auth/logout`. Le handler de mot de passe distingue les parcours `account`, `recovery` et `invitation`; récupération et invitation exigent un marqueur serveur signé, bref et lié à la session.
- `POST /api/admin/invitations` — OWNER/ADMIN invitent des STUDENT; seul OWNER peut demander le rôle ADMIN. Aucun rôle OWNER n’est accepté.
- `POST /api/admin/invitations/resend` — renvoi réservé aux comptes non confirmés et aux rôles autorisés.
- `POST /api/admin/profiles/role` — changement réservé à OWNER, via `public.owner_set_profile_role`; les appels directs ne mettent jamais à jour `profiles.role`.
- `GET /api/admin/audit-logs?limit=50` — lecture du journal réservée à OWNER.

Les mutations vérifient l’origine et valident les entrées. Les handlers privés relisent les claims de session et le rôle courant depuis `profiles`. Le client Admin et `SUPABASE_SECRET_KEY` sont réservés au serveur. Aucune auto-inscription publique ni suppression définitive de compte n’est implémentée. La protection du dernier OWNER relève également de la fonction SQL fournie.

## Configuration locale

1. Installer Node.js 22 ou une version prise en charge par Next.js 16.
2. Installer les dépendances avec `npm ci`.
3. Copier `.env.example` vers `.env.local`, puis saisir les valeurs directement dans l’environnement local autorisé. Ne collez jamais de clés dans le dépôt ou dans le chat.
4. Démarrer avec `npm run dev` et ouvrir `http://localhost:3000`.

Variables attendues (noms uniquement dans le modèle) :

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_SITE_URL=
```

`SUPABASE_SECRET_KEY` est strictement serveur et ne doit jamais porter le préfixe `NEXT_PUBLIC_`. Il sert également à signer le marqueur temporaire des parcours récupération/invitation; il n’est jamais envoyé au navigateur. `NEXT_PUBLIC_SITE_URL` est obligatoire pour les callbacks Auth et doit être une origine HTTPS de confiance (HTTP local est accepté uniquement pour le développement). Aucun callback n’est construit depuis le Host de la requête.

L’application ne configure pas Supabase, SMTP, Vercel ni leurs variables. L’envoi d’invitations et de liens de récupération dépend de la configuration Auth/SMTP effectuée par le propriétaire. Les réponses de l’application ne garantissent pas la livraison d’un e-mail. Le lot n’ajoute pas de limitation applicative de fréquence : le propriétaire devra vérifier/configurer les protections Auth et, avant une ouverture publique, la protection de bordure adaptée. Aucun accès à un service externe n’est nécessaire pour les contrôles applicatifs locaux.

## Foundation V1 et Auth V1

Les fichiers SQL fournis sont conservés séparément :

1. `supabase/migrations/20261119000100_database_foundation_v1.sql`
2. `supabase/migrations/20261121000100_authentication_v1.sql`

Les tests pgTAP correspondants se trouvent dans `supabase/tests/`. `docs/OWNER_BOOTSTRAP.sql` demeure un modèle manuel distinct pour le propriétaire; il n’est pas exécuté automatiquement. **Aucune migration ni aucun test pgTAP n’est lancé par les contrôles de ce dépôt.** Le propriétaire devra faire valider puis appliquer les fichiers dans un environnement autorisé, dans l’ordre prévu, et vérifier les paramètres Auth/API avant toute ouverture.

## Contrôles applicatifs

Commandes prévues :

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

`npm test` exécute les tests Node sous `tests/*.test.mjs` avec le mode de suppression de types expérimental de Node (`node --experimental-strip-types --test`). Les tests pgTAP restent séparés : ils ne sont pas lancés par `npm test`.
