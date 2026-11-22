-- NETWORKING LEVEL UP — Database Foundation V1 pgTAP tests
-- Run only against an isolated local Supabase database. All fixtures are fake
-- and the transaction is rolled back at the end.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('10000000-0000-4000-8000-000000000001', 'student-one@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'student-two@example.invalid'),
  ('10000000-0000-4000-8000-000000000003', 'admin-one@example.invalid'),
  ('10000000-0000-4000-8000-000000000004', 'owner-one@example.invalid'),
  ('10000000-0000-4000-8000-000000000005', 'target-student@example.invalid');

-- The trigger must ignore Auth metadata and always create a STUDENT profile.
UPDATE public.profiles
SET role = 'ADMIN'::public.app_role
WHERE id = '10000000-0000-4000-8000-000000000003';
UPDATE public.profiles
SET role = 'OWNER'::public.app_role
WHERE id = '10000000-0000-4000-8000-000000000004';

UPDATE public.profiles AS p
SET display_name = CASE p.id
  WHEN '10000000-0000-4000-8000-000000000001'::uuid THEN 'Étudiante fictive 1'
  WHEN '10000000-0000-4000-8000-000000000002'::uuid THEN 'Étudiant fictif 2'
  WHEN '10000000-0000-4000-8000-000000000005'::uuid THEN 'Cible fictive'
END
WHERE p.id IN (
  '10000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000002'::uuid,
  '10000000-0000-4000-8000-000000000005'::uuid
);

INSERT INTO public.courses
  (id, title, slug, description, category, status, created_by)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'Cours publié fictif', 'fixture-published', NULL,
   'networking_fundamentals', 'published', '10000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000002', 'Brouillon fictif', 'fixture-draft', NULL,
   'ipv4_subnetting', 'draft', '10000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000003', 'Cours libre fictif', 'fixture-open', NULL,
   'ipv6', 'published', '10000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000004', 'Cours sans inscription fictif', 'fixture-unenrolled', NULL,
   'routing', 'published', '10000000-0000-4000-8000-000000000003');

INSERT INTO public.lessons
  (id, course_id, title, slug, content, sort_order, status)
VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'Leçon publiée fictive', 'fixture-published-lesson', 'Contenu fictif', 1, 'published'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   'Leçon brouillon fictive', 'fixture-draft-lesson', 'Contenu fictif', 2, 'draft'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002',
   'Leçon publiée dans cours brouillon', 'fixture-hidden-course-lesson', 'Contenu fictif', 1, 'published'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004',
   'Leçon sans inscription', 'fixture-unenrolled-lesson', 'Contenu fictif', 1, 'published');

INSERT INTO public.enrollments (user_id, course_id) VALUES
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001');

INSERT INTO public.lesson_progress (user_id, lesson_id, completed_at)
VALUES ('10000000-0000-4000-8000-000000000002',
        '30000000-0000-4000-8000-000000000001', NULL);

SELECT extensions.ok(
  (
    SELECT pg_catalog.count(*) = 5 AND pg_catalog.bool_and(c.relrowsecurity)
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY (ARRAY[
        'profiles', 'courses', 'lessons', 'enrollments', 'lesson_progress'
      ])
  ),
  'RLS is enabled on all five application tables'
);
SELECT extensions.is(
  (SELECT role::text FROM public.profiles
   WHERE id = '10000000-0000-4000-8000-000000000001'),
  'STUDENT',
  'new Auth users receive STUDENT by default'
);
SELECT extensions.ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'app_private.set_profile_role(uuid,public.app_role)',
    'EXECUTE'
  ),
  'authenticated can invoke the controlled role function'
);
SELECT extensions.ok(
  NOT pg_catalog.has_function_privilege(
    'anon',
    'app_private.set_profile_role(uuid,public.app_role)',
    'EXECUTE'
  ),
  'anon cannot invoke the controlled role function'
);
SELECT extensions.ok(
  NOT pg_catalog.has_schema_privilege('anon', 'app_private', 'USAGE')
  AND NOT pg_catalog.has_schema_privilege('authenticated', 'app_private', 'CREATE'),
  'app_private grants no schema access to anon and no schema creation to authenticated'
);
SELECT extensions.ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace AS n
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
    ) AS acl
    WHERE n.nspname = 'app_private'
      AND acl.grantee = 0
      AND acl.privilege_type IN ('USAGE', 'CREATE')
  ),
  'PUBLIC has no USAGE or CREATE privilege on app_private'
);
SELECT extensions.ok(
  (SELECT pg_catalog.count(*) >= 10
   FROM pg_catalog.pg_policies
   WHERE schemaname = 'public'
     AND tablename = ANY (ARRAY['profiles', 'courses', 'lessons', 'enrollments', 'lesson_progress'])),
  'RLS policies are installed across the application tables'
);
-- The PostgREST exposed-schema list is external configuration and must keep
-- app_private excluded; pgTAP cannot verify that project setting.

-- 1. VISITEUR : published rows only.
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.sub" = '';
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.courses
   WHERE id = '20000000-0000-4000-8000-000000000001'),
  1,
  'visitor can read a published course'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.courses
   WHERE id = '20000000-0000-4000-8000-000000000002'),
  0,
  'visitor cannot read a draft course'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.lessons
   WHERE id = '30000000-0000-4000-8000-000000000001'),
  1,
  'visitor can read a published lesson in a published course'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.lessons
   WHERE id = '30000000-0000-4000-8000-000000000002'),
  0,
  'visitor cannot read a draft lesson'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.lessons
   WHERE id = '30000000-0000-4000-8000-000000000003'),
  0,
  'visitor cannot read a lesson whose course is a draft'
);
RESET ROLE;

-- 2. STUDENT : own profile, enrollment and enrolled-course progression only.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.profiles
   WHERE id = '10000000-0000-4000-8000-000000000001'),
  1,
  'student can read their own profile'
);
SELECT extensions.is_empty(
  $$SELECT id FROM public.profiles
    WHERE id = '10000000-0000-4000-8000-000000000002'::uuid$$,
  'student cannot read another student profile'
);
SELECT extensions.throws_ok(
  $$UPDATE public.profiles SET role = 'ADMIN'::public.app_role
    WHERE id = '10000000-0000-4000-8000-000000000001'::uuid$$,
  '42501', NULL,
  'student cannot change their role directly'
);
SELECT extensions.throws_ok(
  $$INSERT INTO public.profiles (id)
    VALUES ('10000000-0000-4000-8000-000000000005'::uuid)$$,
  '42501', NULL,
  'student cannot insert a profile directly'
);
SELECT extensions.is_empty(
  $$UPDATE public.courses SET title = 'Modification interdite'
    WHERE id = '20000000-0000-4000-8000-000000000001'::uuid
    RETURNING id$$,
  'student cannot modify a course'
);
SELECT extensions.throws_ok(
  $$INSERT INTO public.courses
      (title, slug, category, status, created_by)
    VALUES ('Cours interdit', 'student-cannot-create', 'routing', 'draft',
      '10000000-0000-4000-8000-000000000001'::uuid)$$,
  '42501', NULL,
  'student cannot create a course'
);
SELECT extensions.is_empty(
  $$SELECT lesson_id FROM public.lesson_progress
    WHERE user_id = '10000000-0000-4000-8000-000000000002'::uuid$$,
  'student cannot read another student progress'
);
SELECT extensions.lives_ok(
  $$INSERT INTO public.enrollments (user_id, course_id)
    VALUES ('10000000-0000-4000-8000-000000000001'::uuid,
            '20000000-0000-4000-8000-000000000003'::uuid)$$,
  'student can self-enroll in a published course'
);
SELECT extensions.throws_ok(
  $$INSERT INTO public.enrollments (user_id, course_id)
    VALUES ('10000000-0000-4000-8000-000000000001'::uuid,
            '20000000-0000-4000-8000-000000000002'::uuid)$$,
  '42501', NULL,
  'student cannot self-enroll in a draft course'
);
SELECT extensions.lives_ok(
  $$INSERT INTO public.lesson_progress (user_id, lesson_id, completed_at)
    VALUES ('10000000-0000-4000-8000-000000000001'::uuid,
            '30000000-0000-4000-8000-000000000001'::uuid, pg_catalog.now())$$,
  'student can record progress for an enrolled published lesson'
);
SELECT extensions.throws_ok(
  $$INSERT INTO public.lesson_progress (user_id, lesson_id, completed_at)
    VALUES ('10000000-0000-4000-8000-000000000001'::uuid,
            '30000000-0000-4000-8000-000000000004'::uuid, pg_catalog.now())$$,
  '42501', NULL,
  'student cannot record progress for a course without enrollment'
);
SELECT extensions.is_empty(
  $$UPDATE public.lesson_progress SET completed_at = pg_catalog.now()
    WHERE user_id = '10000000-0000-4000-8000-000000000002'::uuid
      AND lesson_id = '30000000-0000-4000-8000-000000000001'::uuid
    RETURNING user_id$$,
  'student cannot modify another student progress'
);
RESET ROLE;

-- 3. ADMIN : course, lesson, enrollment and student-profile management, but no
-- role administration and no access to non-student profiles.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
SET LOCAL "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.profiles
   WHERE id = '10000000-0000-4000-8000-000000000001'),
  1,
  'admin can read student profiles'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.lesson_progress),
  2,
  'admin can consult student progress'
);
SELECT extensions.is_empty(
  $$UPDATE public.lesson_progress SET completed_at = pg_catalog.now()
    WHERE user_id = '10000000-0000-4000-8000-000000000002'::uuid
      AND lesson_id = '30000000-0000-4000-8000-000000000001'::uuid
    RETURNING user_id$$,
  'admin cannot modify student progress'
);
SELECT extensions.is_empty(
  $$SELECT id FROM public.profiles
    WHERE id = '10000000-0000-4000-8000-000000000004'::uuid$$,
  'admin cannot read the owner profile'
);
SELECT extensions.lives_ok(
  $$INSERT INTO public.courses (title, slug, category, status, created_by)
    VALUES ('Cours admin', 'admin-managed-course', 'routing', 'draft',
            (SELECT auth.uid()))$$,
  'admin can create a course'
);
SELECT extensions.lives_ok(
  $$UPDATE public.courses SET title = 'Cours admin modifié'
    WHERE slug = 'admin-managed-course'$$,
  'admin can update a course'
);
SELECT extensions.lives_ok(
  $$DELETE FROM public.courses WHERE slug = 'admin-managed-course'$$,
  'admin can delete a course'
);
SELECT extensions.lives_ok(
  $$INSERT INTO public.lessons
      (course_id, title, slug, content, sort_order, status)
    VALUES ('20000000-0000-4000-8000-000000000001'::uuid,
            'Leçon admin', 'admin-managed-lesson', 'Contenu fictif', 9, 'draft')$$,
  'admin can create a lesson'
);
SELECT extensions.lives_ok(
  $$UPDATE public.lessons SET content = 'Contenu fictif modifié'
    WHERE course_id = '20000000-0000-4000-8000-000000000001'::uuid
      AND slug = 'admin-managed-lesson'$$,
  'admin can update a lesson'
);
SELECT extensions.lives_ok(
  $$DELETE FROM public.lessons
    WHERE course_id = '20000000-0000-4000-8000-000000000001'::uuid
      AND slug = 'admin-managed-lesson'$$,
  'admin can delete a lesson'
);
SELECT extensions.lives_ok(
  $$INSERT INTO public.enrollments (user_id, course_id)
    VALUES ('10000000-0000-4000-8000-000000000005'::uuid,
            '20000000-0000-4000-8000-000000000003'::uuid)$$,
  'admin can create an enrollment'
);
SELECT extensions.lives_ok(
  $$DELETE FROM public.enrollments
    WHERE user_id = '10000000-0000-4000-8000-000000000005'::uuid
      AND course_id = '20000000-0000-4000-8000-000000000003'::uuid$$,
  'admin can manage and remove an enrollment'
);
SELECT extensions.throws_ok(
  $$SELECT app_private.set_profile_role(
      '10000000-0000-4000-8000-000000000005'::uuid,
      'ADMIN'::public.app_role)$$,
  '42501', NULL,
  'admin cannot promote a student to admin'
);
SELECT extensions.throws_ok(
  $$SELECT app_private.set_profile_role(
      '10000000-0000-4000-8000-000000000003'::uuid,
      'STUDENT'::public.app_role)$$,
  '42501', NULL,
  'admin cannot demote an admin'
);
SELECT extensions.throws_ok(
  $$SELECT app_private.set_profile_role(
      '10000000-0000-4000-8000-000000000004'::uuid,
      'STUDENT'::public.app_role)$$,
  '42501', NULL,
  'admin cannot change the owner role'
);
SELECT extensions.throws_ok(
  $$UPDATE public.profiles SET role = 'STUDENT'::public.app_role
    WHERE id = '10000000-0000-4000-8000-000000000003'::uuid$$,
  '42501', NULL,
  'admin cannot update a role directly'
);
RESET ROLE;

-- 4. OWNER : full course/profile management through the dedicated role helper.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000004';
SET LOCAL "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}';
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.profiles),
  5,
  'owner can read all profiles'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.lesson_progress),
  2,
  'owner can consult student progress'
);
SELECT extensions.is_empty(
  $$UPDATE public.lesson_progress SET completed_at = pg_catalog.now()
    WHERE user_id = '10000000-0000-4000-8000-000000000002'::uuid
      AND lesson_id = '30000000-0000-4000-8000-000000000001'::uuid
    RETURNING user_id$$,
  'owner cannot modify student progress'
);
SELECT extensions.lives_ok(
  $$INSERT INTO public.courses (title, slug, category, status, created_by)
    VALUES ('Cours owner', 'owner-managed-course', 'switching', 'draft',
            (SELECT auth.uid()))$$,
  'owner can create a course'
);
SELECT extensions.lives_ok(
  $$UPDATE public.courses SET title = 'Cours owner modifié'
    WHERE slug = 'owner-managed-course'$$,
  'owner can update a course'
);
SELECT extensions.lives_ok(
  $$DELETE FROM public.courses WHERE slug = 'owner-managed-course'$$,
  'owner can delete a course'
);
SELECT extensions.lives_ok(
  $$SELECT app_private.set_profile_role(
      '10000000-0000-4000-8000-000000000005'::uuid,
      'ADMIN'::public.app_role)$$,
  'owner can assign the admin role'
);
SELECT extensions.is(
  (SELECT role::text FROM public.profiles
   WHERE id = '10000000-0000-4000-8000-000000000005'),
  'ADMIN',
  'owner role change is reflected in the database'
);
SELECT extensions.throws_ok(
  $$SELECT app_private.set_profile_role(
      '10000000-0000-4000-8000-000000000004'::uuid,
      'STUDENT'::public.app_role)$$,
  '23514', NULL,
  'the last owner cannot be demoted'
);
SELECT extensions.throws_ok(
  $$UPDATE public.profiles SET role = 'STUDENT'::public.app_role
    WHERE id = '10000000-0000-4000-8000-000000000004'::uuid$$,
  '42501', NULL,
  'owner also cannot change a role directly'
);
SELECT extensions.lives_ok(
  $$SELECT app_private.set_profile_role(
      '10000000-0000-4000-8000-000000000005'::uuid,
      'OWNER'::public.app_role)$$,
  'owner can promote another profile to OWNER'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.profiles
   WHERE role = 'OWNER'::public.app_role),
  2,
  'multiple OWNER profiles are permitted'
);
SELECT extensions.lives_ok(
  $$SELECT app_private.set_profile_role(
      '10000000-0000-4000-8000-000000000005'::uuid,
      'STUDENT'::public.app_role)$$,
  'owner can demote another OWNER while the acting OWNER remains'
);
RESET ROLE;

-- Simulate a trusted Auth deletion path: the database trigger still protects
-- the final OWNER even when the caller bypasses application RLS.
SELECT extensions.throws_ok(
  $$DELETE FROM public.profiles
    WHERE id = '10000000-0000-4000-8000-000000000004'::uuid$$,
  '23514', NULL,
  'the last owner profile cannot be deleted'
);

SELECT * FROM extensions.finish();
ROLLBACK;
