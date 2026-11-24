-- NETWORKING LEVEL UP — atomic assessment write tests
-- Apply in order after all prerequisite migrations:
-- 20261119000100_database_foundation_v1.sql (Foundation V1)
-- 20261121000100_authentication_v1.sql (Auth V1)
-- 20261123000100_learning_experience_v1.sql (Learning Experience V1)
-- 20261123000200_atomic_assessment_writes.sql (Atomic Assessment Writes V2)
-- Run only in a disposable local Supabase/PGlite-compatible database.
-- The test transaction, fixtures and temporary validator stub are rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('42000000-0000-4000-8000-000000000001', 'atomic-admin@example.invalid'),
  ('42000000-0000-4000-8000-000000000002', 'atomic-student@example.invalid'),
  ('42000000-0000-4000-8000-000000000003', 'atomic-owner@example.invalid');
UPDATE public.profiles SET role = 'ADMIN'::public.app_role
WHERE id = '42000000-0000-4000-8000-000000000001';
UPDATE public.profiles SET role = 'OWNER'::public.app_role
WHERE id = '42000000-0000-4000-8000-000000000003';

INSERT INTO public.courses (id, title, slug, category, status, created_by) VALUES
  ('42000000-0000-4000-8000-000000000100', 'Atomic test', 'atomic-test',
   'networking_fundamentals'::public.course_category, 'published'::public.course_status,
   '42000000-0000-4000-8000-000000000001'),
  ('42000000-0000-4000-8000-000000000102', 'Other course', 'atomic-other',
   'networking_fundamentals'::public.course_category, 'published'::public.course_status,
   '42000000-0000-4000-8000-000000000001');
INSERT INTO public.lessons (id, course_id, title, slug, status)
VALUES (
  '42000000-0000-4000-8000-000000000101',
  '42000000-0000-4000-8000-000000000100', 'Atomic lesson', 'atomic-lesson',
  'published'::public.course_status
);
INSERT INTO public.enrollments (user_id, course_id)
VALUES ('42000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000100');

-- Test-only failure proves the assessment insert/update is rolled back if the
-- paired answer-key write fails later in the same RPC statement.
ALTER TABLE public.assessment_answer_keys
  ADD CONSTRAINT pgtap_force_answer_key_failure
  CHECK (answers <> '{"q1":"pgtap-force-failure"}'::jsonb);

SELECT extensions.ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.save_assessment_definition(uuid,uuid,uuid,text,text,jsonb,public.course_status,jsonb)',
    'EXECUTE'),
  'authenticated may call the assessment save function');
SELECT extensions.ok(
  NOT pg_catalog.has_function_privilege(
    'anon',
    'public.save_assessment_definition(uuid,uuid,uuid,text,text,jsonb,public.course_status,jsonb)',
    'EXECUTE'),
  'anon cannot call the assessment save function');
SELECT extensions.ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'app_private.validate_assessment_definition(text,text,jsonb,jsonb)',
    'EXECUTE'),
  'authenticated may invoke the shared assessment validator');
SELECT extensions.ok(
  pg_catalog.has_function_privilege(
    'authenticated', 'public.assessment_questions_public_only(jsonb)', 'EXECUTE'),
  'authenticated can execute the public question validator');
SELECT extensions.ok(
  NOT pg_catalog.has_function_privilege(
    'anon', 'public.assessment_questions_public_only(jsonb)', 'EXECUTE'),
  'anon cannot execute the public question validator');
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM pg_catalog.pg_trigger
   WHERE tgname IN (
     'assessment_definition_consistency_assessments',
     'assessment_definition_consistency_answer_keys'
   ) AND tgdeferrable AND tginitdeferred),
  2,
  'both integrity triggers are initially deferred');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '42000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claims" = '{"sub":"42000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT extensions.ok(
  public.assessment_questions_public_only(
    '[{"id":"q1","prompt":"Question","type":"short_answer"}]'::jsonb),
  'question validator accepts a supported question type');
SELECT extensions.ok(
  public.assessment_questions_public_only(
    '[{"id":"q1","prompt":"Question","type":"single_choice","options":[{"id":"o1","text":"First"},{"id":"o2","text":"Second"}]}]'::jsonb),
  'question validator accepts single_choice');
SELECT extensions.ok(
  NOT public.assessment_questions_public_only(
    '[{"id":"q1","prompt":"Question","type":"essay"}]'::jsonb),
  'question validator rejects unsupported question types');
SELECT extensions.ok(
  public.assessment_questions_public_only(NULL::jsonb) IS NULL,
  'question validator returns NULL for SQL NULL input');
SELECT extensions.throws_ok(
  $$SELECT public.save_assessment_definition(
    NULL::uuid,
    '42000000-0000-4000-8000-000000000100'::uuid,
    NULL::uuid,
    'Null questions', '', NULL::jsonb,
    'draft'::public.course_status, '{"q1":"Expected"}'::jsonb
  )$$,
  '22023', NULL,
  'RPC rejects SQL NULL questions');
SELECT extensions.throws_ok(
  $$SELECT public.save_assessment_definition(
    NULL::uuid,
    '42000000-0000-4000-8000-000000000100'::uuid,
    NULL::uuid,
    'Long instructions', pg_catalog.repeat('x', 2001),
    '[{"id":"q1","prompt":"Question","type":"short_answer"}]'::jsonb,
    'draft'::public.course_status, '{"q1":"Expected"}'::jsonb
  )$$,
  '22023', NULL,
  'RPC enforces the 2000-character instructions limit');
SELECT extensions.lives_ok(
  $$SELECT public.save_assessment_definition(
    NULL::uuid,
    '42000000-0000-4000-8000-000000000100'::uuid,
    '42000000-0000-4000-8000-000000000101'::uuid,
    'Initial assessment', 'Instructions',
    '[{"id":"q1","prompt":"Question","type":"short_answer"}]'::jsonb,
    'draft'::public.course_status, '{"q1":"Expected"}'::jsonb
  )$$,
  'ADMIN can create an assessment and its answer key');
SET CONSTRAINTS assessment_definition_consistency_assessments,
                assessment_definition_consistency_answer_keys IMMEDIATE;
SET CONSTRAINTS assessment_definition_consistency_assessments,
                assessment_definition_consistency_answer_keys DEFERRED;
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.assessments
   WHERE title = 'Initial assessment'),
  1,
  'assessment was created');

-- A valid OWNER profile can use the same RPC; the role comes from the profile,
-- not from the JWT role claim.
SET LOCAL "request.jwt.claim.sub" = '42000000-0000-4000-8000-000000000003';
SET LOCAL "request.jwt.claims" = '{"sub":"42000000-0000-4000-8000-000000000003","role":"authenticated"}';
SELECT extensions.lives_ok(
  $$SELECT public.save_assessment_definition(
    NULL::uuid,
    '42000000-0000-4000-8000-000000000100'::uuid,
    NULL::uuid,
    'Owner assessment', '',
    '[{"id":"q1","prompt":"Question","type":"short_answer"}]'::jsonb,
    'draft'::public.course_status, '{"q1":"Expected"}'::jsonb
  )$$,
  'OWNER can create an assessment and its answer key');
SET CONSTRAINTS assessment_definition_consistency_assessments,
                assessment_definition_consistency_answer_keys IMMEDIATE;
SET CONSTRAINTS assessment_definition_consistency_assessments,
                assessment_definition_consistency_answer_keys DEFERRED;
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.assessments WHERE title = 'Owner assessment'),
  1,
  'OWNER assessment was created');

SET LOCAL "request.jwt.claim.sub" = '42000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claims" = '{"sub":"42000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT extensions.throws_ok(
  $$SELECT public.save_assessment_definition(
    NULL::uuid,
    '42000000-0000-4000-8000-000000000100'::uuid,
    NULL::uuid,
    'Mismatched answer key', '',
    '[{"id":"q1","prompt":"Question","type":"short_answer"}]'::jsonb,
    'draft'::public.course_status, '{"q2":"Expected"}'::jsonb
  )$$,
  '22023', NULL,
  'RPC rejects answer keys that do not match question identifiers');
SELECT extensions.throws_ok(
  $$SELECT public.save_assessment_definition(
    NULL::uuid,
    '42000000-0000-4000-8000-000000000100'::uuid,
    NULL::uuid,
    'Invalid choice key', '',
    '[{"id":"q1","prompt":"Question","type":"single_choice","options":[{"id":"o1","text":"First"},{"id":"o2","text":"Second"}]}]'::jsonb,
    'draft'::public.course_status, '{"q1":"o3"}'::jsonb
  )$$,
  '22023', NULL,
  'RPC rejects a single-choice answer that is not an option identifier');
SELECT extensions.throws_ok(
  $$SELECT public.save_assessment_definition(
    NULL::uuid,
    '42000000-0000-4000-8000-000000000100'::uuid,
    NULL::uuid,
    'Missing option text', '',
    '[{"id":"q1","prompt":"Question","type":"single_choice","options":[{"id":"o1"},{"id":"o2","text":"Second"}]}]'::jsonb,
    'draft'::public.course_status, '{"q1":"o1"}'::jsonb
  )$$,
  '22023', NULL, 'RPC rejects option text that is missing');
SELECT extensions.throws_ok(
  $$SELECT public.save_assessment_definition(
    NULL::uuid,
    '42000000-0000-4000-8000-000000000100'::uuid,
    NULL::uuid,
    'Null option text', '',
    '[{"id":"q1","prompt":"Question","type":"single_choice","options":[{"id":"o1","text":null},{"id":"o2","text":"Second"}]}]'::jsonb,
    'draft'::public.course_status, '{"q1":"o1"}'::jsonb
  )$$,
  '22023', NULL, 'RPC rejects JSON null option text');
SELECT extensions.throws_ok(
  $$SELECT public.save_assessment_definition(
    NULL::uuid,
    '42000000-0000-4000-8000-000000000100'::uuid,
    NULL::uuid,
    'Empty option text', '',
    '[{"id":"q1","prompt":"Question","type":"single_choice","options":[{"id":"o1","text":""},{"id":"o2","text":"Second"}]}]'::jsonb,
    'draft'::public.course_status, '{"q1":"o1"}'::jsonb
  )$$,
  '22023', NULL, 'RPC rejects empty option text');

SELECT extensions.lives_ok(
  $$SELECT public.save_assessment_definition(
    (SELECT id FROM public.assessments WHERE title = 'Initial assessment'),
    '42000000-0000-4000-8000-000000000100'::uuid,
    '42000000-0000-4000-8000-000000000101'::uuid,
    'Updated assessment', 'Updated instructions',
    '[{"id":"q1","prompt":"Updated question","type":"short_answer"}]'::jsonb,
    'published'::public.course_status, '{"q1":"Updated expected"}'::jsonb
  )$$,
  'ADMIN can update the assessment and answer key together');
SET CONSTRAINTS assessment_definition_consistency_assessments,
                assessment_definition_consistency_answer_keys IMMEDIATE;
SET CONSTRAINTS assessment_definition_consistency_assessments,
                assessment_definition_consistency_answer_keys DEFERRED;
SELECT extensions.is(
  (SELECT title FROM public.assessments WHERE title = 'Updated assessment'),
  'Updated assessment', 'updated assessment fields are stored');
SELECT extensions.is(
  (SELECT answers->>'q1' FROM public.assessment_answer_keys
   WHERE assessment_id = (SELECT id FROM public.assessments WHERE title = 'Updated assessment')),
  'Updated expected', 'updated answer key matches the assessment');

-- The composite FK prevents later lesson reassignment to another course.
SELECT extensions.throws_ok(
  $$UPDATE public.lessons
    SET course_id = '42000000-0000-4000-8000-000000000102'::uuid
    WHERE id = '42000000-0000-4000-8000-000000000101'::uuid$$,
  '23503', NULL,
  'lesson cannot be moved to a different course while an assessment references it');
SELECT extensions.is(
  (SELECT course_id FROM public.lessons
   WHERE id = '42000000-0000-4000-8000-000000000101'),
  '42000000-0000-4000-8000-000000000100'::uuid,
  'failed lesson reassignment leaves the original course intact');

-- Explicitly force the initially-deferred constraints while acting as staff;
-- standalone Data API writes cannot commit an unpaired row or mismatched key.
SET CONSTRAINTS assessment_definition_consistency_assessments,
                assessment_definition_consistency_answer_keys IMMEDIATE;
SELECT extensions.throws_ok(
  $$INSERT INTO public.assessments (
      course_id, lesson_id, title, instructions, questions, status, created_by
    ) VALUES (
      '42000000-0000-4000-8000-000000000100'::uuid, NULL,
      'Direct orphan assessment', '',
      '[{"id":"q1","prompt":"Question","type":"short_answer"}]'::jsonb,
      'draft'::public.course_status, auth.uid()
    )$$,
  '23514', NULL,
  'direct assessment insert cannot commit without its answer key');
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.assessments
   WHERE title = 'Direct orphan assessment'),
  0,
  'rejected direct insert leaves no assessment row');
SELECT extensions.throws_ok(
  $$UPDATE public.assessments
    SET questions = '[{"id":"q2","prompt":"Changed identifier","type":"short_answer"}]'::jsonb
    WHERE title = 'Updated assessment'$$,
  '22023', NULL,
  'direct assessment write cannot desynchronize its answer key');
SELECT extensions.throws_ok(
  $$DELETE FROM public.assessment_answer_keys
    WHERE assessment_id = (SELECT id FROM public.assessments WHERE title = 'Updated assessment')$$,
  '23514', NULL,
  'direct answer-key deletion cannot leave an assessment without a key');
SET CONSTRAINTS assessment_definition_consistency_assessments,
                assessment_definition_consistency_answer_keys DEFERRED;

-- Failed UPDATE must restore both rows.
SELECT extensions.throws_ok(
  $$SELECT public.save_assessment_definition(
    (SELECT id FROM public.assessments WHERE title = 'Updated assessment'),
    '42000000-0000-4000-8000-000000000100'::uuid,
    '42000000-0000-4000-8000-000000000101'::uuid,
    'Should roll back', 'Forced answer-key constraint failure',
    '[{"id":"q1","prompt":"Changed prompt","type":"short_answer"}]'::jsonb,
    'draft'::public.course_status, '{"q1":"pgtap-force-failure"}'::jsonb
  )$$,
  '23514', NULL,
  'invalid answer-key write fails during update');
SELECT extensions.is(
  (SELECT title FROM public.assessments WHERE title = 'Updated assessment'),
  'Updated assessment', 'assessment update rolls back when answer-key write fails');
SELECT extensions.is(
  (SELECT answers->>'q1' FROM public.assessment_answer_keys
   WHERE assessment_id = (SELECT id FROM public.assessments WHERE title = 'Updated assessment')),
  'Updated expected', 'answer key remains unchanged after failed update');

-- Failed CREATE must not leave an assessment row behind.
SELECT extensions.throws_ok(
  $$SELECT public.save_assessment_definition(
    NULL::uuid,
    '42000000-0000-4000-8000-000000000100'::uuid,
    NULL::uuid,
    'Create should roll back', '',
    '[{"id":"q1","prompt":"Question","type":"short_answer"}]'::jsonb,
    'draft'::public.course_status, '{"q1":"pgtap-force-failure"}'::jsonb
  )$$,
  '23514', NULL,
  'invalid answer-key write fails during creation');
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.assessments
   WHERE title = 'Create should roll back'),
  0,
  'failed creation leaves no assessment row');

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '42000000-0000-4000-8000-000000000002';
SET LOCAL "request.jwt.claims" = '{"sub":"42000000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.assessments WHERE title = 'Updated assessment'),
  1, 'enrolled STUDENT can read a published assessment');
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.assessment_answer_keys),
  0, 'STUDENT cannot read expected answers through RLS');
SELECT extensions.lives_ok(
  $$INSERT INTO public.assessment_attempts (assessment_id, user_id, answers)
    SELECT id, auth.uid(), '{"q1":"Student answer"}'::jsonb
    FROM public.assessments WHERE title = 'Updated assessment'$$,
  'STUDENT can submit their own answer for a published assessment');
SELECT extensions.is(
  (SELECT pg_catalog.count(*)::integer FROM public.assessment_attempts WHERE user_id = auth.uid()),
  1, 'STUDENT can read their own attempt');
SELECT extensions.ok(
  pg_catalog.has_column_privilege('authenticated', 'public.assessment_attempts', 'score', 'UPDATE'),
  'authenticated has the column privilege needed to attempt score update');
WITH changed AS (
  UPDATE public.assessment_attempts SET score = 100
  WHERE id = (SELECT id FROM public.assessment_attempts WHERE user_id = auth.uid())
  RETURNING id
)
SELECT extensions.is((SELECT pg_catalog.count(*)::integer FROM changed), 0,
  'RLS blocks update of the existing student attempt');
SELECT extensions.ok(
  (SELECT score IS NULL FROM public.assessment_attempts WHERE user_id = auth.uid()),
  'student score remains unset after the blocked update');
SELECT extensions.throws_ok(
  $$SELECT public.save_assessment_definition(
    NULL::uuid,
    '42000000-0000-4000-8000-000000000100'::uuid,
    NULL::uuid,
    'Student attempt', '',
    '[{"id":"q1","prompt":"Question","type":"short_answer"}]'::jsonb,
    'draft'::public.course_status, '{"q1":"Expected"}'::jsonb
  )$$,
  '42501', NULL, 'STUDENT cannot create or edit assessments');
RESET ROLE;

-- Temporarily make the helper return TRUE to demonstrate that the RPC's own
-- explicit type guard still rejects an unsupported type. The enclosing test
-- transaction rolls this test-only replacement back.
CREATE OR REPLACE FUNCTION public.assessment_questions_public_only(p_questions jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT TRUE
$function$;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '42000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claims" = '{"sub":"42000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT extensions.throws_ok(
  $$SELECT public.save_assessment_definition(
    NULL::uuid,
    '42000000-0000-4000-8000-000000000100'::uuid,
    NULL::uuid,
    'Unsupported type', '',
    '[{"id":"q1","prompt":"Question","type":"essay"}]'::jsonb,
    'draft'::public.course_status, '{"q1":"Expected"}'::jsonb
  )$$,
  '22023', NULL,
  'RPC explicit type guard rejects unsupported types even if the helper allows them');
RESET ROLE;

SELECT * FROM extensions.finish();
ROLLBACK;
