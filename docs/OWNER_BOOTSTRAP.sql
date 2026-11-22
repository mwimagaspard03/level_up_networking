-- NETWORKING LEVEL UP — Initialisation manuelle du premier OWNER
-- À utiliser après Foundation V1 et après création/vérification du compte Auth voulu.
-- Remplacer les deux valeurs par l'UUID et l'adresse e-mail exacte du même compte Auth.
-- Ce bootstrap est réservé au premier OWNER; les OWNER suivants restent autorisés par la RPC Foundation.
-- Ne jamais demander à Manus d'exécuter ce fichier.

BEGIN;

DO $bootstrap$
DECLARE
  v_owner_id uuid := '00000000-0000-0000-0000-000000000000';
  v_owner_email text := 'replace-with-verified-email@example.invalid';
BEGIN
  -- Sérialise ce bootstrap avec les changements de rôle qui protègent le dernier OWNER.
  PERFORM pg_catalog.pg_advisory_xact_lock(20261119000100::bigint);

  IF v_owner_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Replace the placeholder with the verified Auth user UUID';
  END IF;

  IF v_owner_email = 'replace-with-verified-email@example.invalid'
     OR btrim(v_owner_email) = '' THEN
    RAISE EXCEPTION 'Replace the placeholder with the exact verified Auth email';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.id = v_owner_id
      AND pg_catalog.lower(u.email) = pg_catalog.lower(btrim(v_owner_email))
      AND u.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The UUID and verified email must identify the same Auth user';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.role = 'OWNER'::public.app_role
  ) THEN
    RAISE EXCEPTION 'An OWNER already exists; bootstrap is only for the first OWNER';
  END IF;

  UPDATE public.profiles AS p
  SET role = 'OWNER'::public.app_role
  WHERE p.id = v_owner_id
    AND p.role = 'STUDENT'::public.app_role;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile missing or not in the expected STUDENT state';
  END IF;
END;
$bootstrap$;

COMMIT;
