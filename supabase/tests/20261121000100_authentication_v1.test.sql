-- NETWORKING LEVEL UP — Authentication V1 pgTAP tests
-- Run only in an isolated local Supabase database after both migrations.
-- All identities and data are fictitious; the transaction is rolled back.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('41000000-0000-4000-8000-000000000001', 'auth-student@example.invalid'),
  ('41000000-0000-4000-8000-000000000002', 'auth-admin@example.invalid'),
  ('41000000-0000-4000-8000-000000000003', 'auth-owner@example.invalid'),
  ('41000000-0000-4000-8000-000000000004', 'auth-target@example.invalid');

UPDATE public.profiles SET role = 'ADMIN'::public.app_role
WHERE id = '41000000-0000-4000-8000-000000000002';
UPDATE public.profiles SET role = 'OWNER'::public.app_role
WHERE id = '41000000-0000-4000-8000-000000000003';

INSERT INTO public.account_audit_logs
  (actor_user_id, target_user_id, action, target_email, details)
VALUES
  ('41000000-0000-4000-8000-000000000003',
   '41000000-0000-4000-8000-000000000001',
   'student_invited', 'auth-student@example.invalid', '{"source":"fixture"}');

SELECT extensions.ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.owner_set_profile_role(uuid,public.app_role)', 'EXECUTE'),
  'authenticated can execute the OWNER role wrapper');
SELECT extensions.ok(
  NOT pg_catalog.has_function_privilege(
    'anon',
    'public.owner_set_profile_role(uuid,public.app_role)', 'EXECUTE'),
  'anon cannot execute the OWNER role wrapper');
SELECT extensions.ok(
  NOT pg_catalog.has_table_privilege('anon', 'public.account_audit_logs', 'SELECT'),
  'anon has no audit-log read privilege');
SELECT extensions.ok(
  NOT pg_catalog.has_table_privilege('authenticated', 'public.account_audit_logs', 'INSERT')
  AND NOT pg_catalog.has_table_privilege('authenticated', 'public.account_audit_logs', 'UPDATE')
  AND NOT pg_catalog.has_table_privilege('authenticated', 'public.account_audit_logs', 'DELETE'),
  'authenticated has no direct audit-log write privileges');

-- Anonymous visitors cannot read audit records or call the role wrapper.
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.sub" = '';
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';
SELECT extensions.throws_ok(
  $$SELECT pg_catalog.count(*) FROM public.account_audit_logs$$,
  '42501', NULL,
  'anon cannot read audit records');
RESET ROLE;

-- STUDENT cannot read audit records or promote anyone.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '41000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.account_audit_logs), 0,
  'student cannot read audit records');
SELECT extensions.throws_ok(
  $$SELECT public.owner_set_profile_role(
    '41000000-0000-4000-8000-000000000004'::uuid,
    'ADMIN'::public.app_role)$$,
  '42501', NULL,
  'student cannot promote a profile');
RESET ROLE;

-- ADMIN cannot read audit records or promote/demote roles.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '41000000-0000-4000-8000-000000000002';
SET LOCAL "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.account_audit_logs), 0,
  'admin cannot read audit records');
SELECT extensions.throws_ok(
  $$SELECT public.owner_set_profile_role(
    '41000000-0000-4000-8000-000000000004'::uuid,
    'ADMIN'::public.app_role)$$,
  '42501', NULL,
  'admin cannot promote a student to admin');
RESET ROLE;

-- OWNER can read the audit log and manage roles through the wrapper only.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '41000000-0000-4000-8000-000000000003';
SET LOCAL "request.jwt.claims" = '{"sub":"41000000-0000-4000-8000-000000000003","role":"authenticated"}';
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.account_audit_logs), 1,
  'owner can read audit records');
SELECT extensions.lives_ok(
  $$SELECT public.owner_set_profile_role(
    '41000000-0000-4000-8000-000000000004'::uuid,
    'ADMIN'::public.app_role)$$,
  'owner can promote a student to admin');
SELECT extensions.is(
  (SELECT role::text FROM public.profiles
   WHERE id = '41000000-0000-4000-8000-000000000004'),
  'ADMIN',
  'OWNER promotion is persisted');
SELECT extensions.lives_ok(
  $$SELECT public.owner_set_profile_role(
    '41000000-0000-4000-8000-000000000004'::uuid,
    'STUDENT'::public.app_role)$$,
  'owner can demote an admin to student');
SELECT extensions.is(
  (SELECT role::text FROM public.profiles
   WHERE id = '41000000-0000-4000-8000-000000000004'),
  'STUDENT',
  'OWNER demotion is persisted');
SELECT extensions.throws_ok(
  $$SELECT public.owner_set_profile_role(
    '41000000-0000-4000-8000-000000000003'::uuid,
    'STUDENT'::public.app_role)$$,
  '23514', NULL,
  'the final OWNER cannot be demoted through the public wrapper');
SELECT extensions.lives_ok(
  $$SELECT public.owner_set_profile_role(
    '41000000-0000-4000-8000-000000000004'::uuid,
    'OWNER'::public.app_role)$$,
  'OWNER can promote another profile to OWNER through the public wrapper');
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.profiles
   WHERE role = 'OWNER'::public.app_role), 2,
  'the system permits multiple OWNER profiles');
SELECT extensions.lives_ok(
  $$SELECT public.owner_set_profile_role(
    '41000000-0000-4000-8000-000000000004'::uuid,
    'STUDENT'::public.app_role)$$,
  'an OWNER can demote one OWNER while another OWNER remains');
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.profiles
   WHERE role = 'OWNER'::public.app_role), 1,
  'demoting a non-final OWNER leaves the other OWNER active');
RESET ROLE;

SELECT * FROM extensions.finish();
ROLLBACK;
