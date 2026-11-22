# NETWORKING LEVEL UP — Rapport sécurité Foundation V1 / Auth V1

- **Date :** 22 novembre 2026
- **Branche auditée :** `feat/foundation-auth-v1`
- **HEAD au moment de l’audit :** `41aa3ab87a99cc5cd619874692c30ce9030f3e74` (inchangé)
- **État au moment du rapport :** changements locaux non commités; aucune opération distante.

## Résumé des changements

- **Dépendances :** Next.js et `eslint-config-next` alignés sur `16.4.6`, dans la même majeure que la version de départ. Correction non forcée, sans `--force`; `npm audit` retourne **0 vulnérabilité**.
- **Rôles :** permissions centralisées dans `src/lib/auth/roles.ts`. OWNER peut promouvoir un autre profil en OWNER et attribuer ADMIN; invitations ordinaires limitées à STUDENT/ADMIN. ADMIN et STUDENT ne peuvent pas changer les rôles. Le SQL fourni protège le dernier OWNER; cette règle n’a pas pu être exécutée ici. Les migrations n’ont pas été modifiées.
- **Tests :** script `npm test` et tests Node natifs couvrant la matrice des rôles, redirections internes, contrats de connexion/invitation, contrôles de routes et protection des secrets. Les tests pgTAP Foundation/Auth ont été étendus pour les OWNER multiples, promotion/rétrogradation, dernier OWNER, permissions RPC, RLS et ACL de `app_private`.
- **Fichiers de travail concernés :** `package.json`, `package-lock.json`, `src/lib/auth/roles.ts`, routes `app/api/admin/{invitations, invitations/resend, profiles/role}` (chemins exacts : `app/api/admin/invitations/route.ts`, `app/api/admin/invitations/resend/route.ts`, `app/api/admin/profiles/role/route.ts`), `tests/auth-security.test.mjs`, les deux fichiers `supabase/tests/*.test.sql` et ce rapport. Le lot Auth/Foundation préexistant contient aussi README, styles, pages, routes et utilitaires Auth/Supabase non détaillés ici.
- La landing page (`app/page.tsx`) a été préservée. Aucun fichier n’a été supprimé; les migrations restent inchangées.

## Vérifications exécutées

| Commande | Résultat |
| --- | --- |
| `npm audit` | **Réussi** — 0 vulnérabilité |
| `npm test` | **Réussi** — 7 tests, 0 échec; avertissement Node non bloquant sur le module TypeScript typeless |
| `npm run lint` | **Réussi** — 0 erreur, 1 avertissement dans `src/components/auth/PasswordUpdateForm.tsx:44` (`window.location.assign()` pour une navigation Next interne) |
| `npx tsc --noEmit` | **Réussi** |
| `npm run build` | **Réussi** — Next.js 16.4.6, routes statiques et dynamiques compilées |
| `git diff --check` | **Réussi** — y compris contrôle d’espaces du nouveau test Node |

## Non exécuté et risques restants

- **pgTAP Foundation et Auth : NON EXÉCUTÉS.** Aucun `psql`, `pg_prove`, `postgres`, `initdb`, Docker ou Supabase CLI n’est disponible; aucun environnement PostgreSQL local isolé n’est donc fourni. Aucun service, dashboard, base ni migration distante n’a été consulté ou exécuté.
- **Limitation des abus :** aucun rate limiting applicatif, CAPTCHA ou verrouillage par fréquence n’a été trouvé dans les sources parcourues. Avant exposition publique, configurer les limites de fréquence Auth du fournisseur, les quotas SMTP, et une limitation partagée au niveau WAF/API gateway pour connexion, récupération et invitations. La limitation d’invitations doit aussi tenir compte de l’identité staff; un compteur mémoire local ne serait pas suffisant en déploiement multi-instance. Ces réglages externes n’ont pas été vérifiés.
- Les tests Node vérifient des contrats et fonctions locales; ils ne simulent pas un fournisseur Auth/SMTP réel. Les pgTAP devront être exécutés dans un environnement local isolé avant application des migrations.

## État Git et restrictions

Branche confirmée : `feat/foundation-auth-v1`; HEAD inchangé. Aucun commit, push, merge, déploiement, accès à Supabase/Vercel, consultation/demande de secret, ni changement de `main` n’a été effectué. Tous les changements restent locaux pour validation du propriétaire.
