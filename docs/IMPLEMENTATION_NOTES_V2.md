# Learning Experience V2 — état d’intégration

## Base et limites d’exécution

- Patch préparé sur l’archive utilisateur identifiée au commit `f36a04482f84618a406b903bf3d35feb95811c20`.
- Intégration réalisée sur `feat/learning-experience-v2`; `main` n’a pas été modifiée.
- Aucun service Supabase/Vercel distant n’a été consulté et aucune migration n’a été exécutée.
- La migration V2 reste à relire puis à valider en environnement isolé avant toute application manuelle.

## Parcours intégrés

- Catalogue : chaque cours publié mène à son détail, à l’inscription et aux leçons publiées.
- Gestion OWNER/ADMIN : invitation, renvoi protégé, liste des profils (100 plus récents), changement de rôle OWNER-only, cours, publication et journal d’audit OWNER.
- Cours : création en brouillon, édition, suppression avec avertissement des suppressions en cascade, publication/dépublication.
- Leçons : création, édition, suppression, publication/dépublication et ordre de lecture. Les contenus et tentatives restent soumis aux politiques RLS existantes.
- Évaluations : création et édition de questions à choix unique ou réponse courte, publication, passation étudiant, lecture de ses propres résultats et correction manuelle staff.

## Protection des évaluations

- Les questions publiques n’acceptent qu’un schéma limité de champs. La migration ajoute une contrainte de forme pour rejeter les champs de réponse attendue.
- Les clés de correction sont dans `assessment_answer_keys`, séparées des questions publiées, avec politiques et accès OWNER/ADMIN uniquement.
- L’API étudiante valide l’inscription, la publication, l’identité STUDENT et les identifiants de réponses; elle n’accepte ni score ni feedback à l’insertion.
- Le score et le feedback sont modifiables uniquement par le flux staff protégé. Aucune notation automatique n’est implémentée.

## Vérifications et limites restantes

- Tests Node ciblés : couvrent la validation des questions/réponses, les contrats d’accès et l’absence d’exposition des clés; ils ne remplacent pas des tests d’intégration sur PostgreSQL/Supabase.
- Aucun test E2E n’est revendiqué. La migration et les politiques RLS doivent encore être testées avec pgTAP dans une base locale isolée; ce travail n’a pas été exécuté dans cette intégration.
- L’envoi des invitations dépend de la configuration SMTP/provider du projet. Une confirmation e-mail déjà effectuée empêche le renvoi.
- La liste de profils est limitée aux 100 profils les plus récents; aucune pagination ni analyse de progression agrégée n’est fournie.
- Les évaluations sont sans notation automatique; les réponses doivent être examinées et notées par un OWNER/ADMIN.
- Ordre des migrations : Foundation V1, Authentication V1, puis `20261123000100_learning_experience_v1.sql` après examen et validation isolée.
