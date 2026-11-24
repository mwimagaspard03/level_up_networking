# Instructions Manus — intégration NLU V2

Tu reçois une archive de travail préparée à partir de `main` au commit `f36a04482f84618a406b903bf3d35feb95811c20`.

**Objectif : intégrer le patch fourni dans le dépôt réel avec un minimum d'opérations et de tokens.** Ne refais pas l'audit initial.

1. Vérifie uniquement que le HEAD du dépôt correspond à ce commit. Si différent, arrête-toi et signale le SHA.
2. Crée une branche `feat/learning-experience-v2` depuis le `main` vérifié. N'écris jamais sur `main`.
3. Compare les fichiers du ZIP et du dépôt. Intègre les nouveaux fichiers et fusionne les modifications des fichiers existants sans écraser les changements plus récents.
4. Lis `docs/IMPLEMENTATION_NOTES_V2.md` et corrige les TODO d'intégration signalés, notamment le formulaire client de création de leçon et les parcours d'évaluation. N'invente pas de fonctionnalités terminées.
5. Installe les dépendances uniquement si nécessaire, puis exécute tests, lint, TypeScript et build. Corrige les erreurs causées par l'intégration.
6. Prépare un rapport bref : fichiers intégrés, fichiers ajustés, résultats réels des commandes, limites restantes et ordre des migrations.

**Interdictions :** aucun accès Supabase (Dashboard/API/CLI distante/données/configuration), aucun secret demandé ou affiché, aucune migration exécutée, aucun push/commit/merge/déploiement. Prépare le travail sur la branche locale et arrête-toi pour validation.
