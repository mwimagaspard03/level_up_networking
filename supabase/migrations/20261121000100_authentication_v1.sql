-- NETWORKING LEVEL UP — Authentication V1 (additive migration)
-- Depends on 20261119000100_database_foundation_v1.sql.
-- Apply only after Foundation V1 has been validated in an isolated local DB.
-- This migration does not create Auth users and does not bootstrap the OWNER.

BEGIN;

CREATE TABLE public.account_audit_logs (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN (
    'student_invited', 'admin_invited', 'role_changed',
    'invite_resent', 'password_recovery_requested',
    'account_access_revoked'
  )),
  target_email text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT account_audit_logs_details_object
    CHECK (pg_catalog.jsonb_typeof(details) = 'object')
);

CREATE INDEX account_audit_logs_created_at_idx
  ON public.account_audit_logs (created_at DESC);
CREATE INDEX account_audit_logs_actor_idx
  ON public.account_audit_logs (actor_user_id, created_at DESC);
CREATE INDEX account_audit_logs_target_idx
  ON public.account_audit_logs (target_user_id, created_at DESC);

ALTER TABLE public.account_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.account_audit_logs TO authenticated;

CREATE POLICY account_audit_logs_owner_read
ON public.account_audit_logs
FOR SELECT TO authenticated
USING ((SELECT app_private.current_actor_role()) = 'OWNER'::public.app_role);

-- Public RPC wrapper. SECURITY INVOKER preserves the caller's auth.uid();
-- the existing private SECURITY DEFINER helper enforces OWNER authorization.
CREATE FUNCTION public.owner_set_profile_role(
  p_target_profile_id uuid,
  p_new_role public.app_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  PERFORM app_private.set_profile_role(p_target_profile_id, p_new_role);
END;
$function$;

REVOKE ALL ON FUNCTION public.owner_set_profile_role(uuid, public.app_role)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_set_profile_role(uuid, public.app_role)
  TO authenticated;

COMMIT;
