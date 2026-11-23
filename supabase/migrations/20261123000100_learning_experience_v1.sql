-- NETWORKING LEVEL UP — Learning Experience V1
-- Additive migration. Review and apply manually only after backup and isolated validation.
BEGIN;
CREATE FUNCTION public.assessment_questions_public_only(p_questions jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
 SELECT pg_catalog.jsonb_typeof(p_questions) = 'array'
 AND NOT EXISTS (
  SELECT 1
  FROM pg_catalog.jsonb_array_elements(p_questions) AS question(value)
  WHERE pg_catalog.jsonb_typeof(question.value) <> 'object'
   OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(question.value) AS field(key)
    WHERE field.key NOT IN ('id','prompt','type','options')
   )
   OR pg_catalog.jsonb_typeof(question.value->'id') IS DISTINCT FROM 'string'
   OR pg_catalog.jsonb_typeof(question.value->'prompt') IS DISTINCT FROM 'string'
   OR pg_catalog.jsonb_typeof(question.value->'type') IS DISTINCT FROM 'string'
   OR question.value->>'type' NOT IN ('single_choice','short_answer')
   OR (pg_catalog.jsonb_typeof(question.value->'options') IS NOT NULL AND (
    pg_catalog.jsonb_typeof(question.value->'options') <> 'array'
    OR EXISTS (
     SELECT 1 FROM pg_catalog.jsonb_array_elements(question.value->'options') AS option(value)
     WHERE pg_catalog.jsonb_typeof(option.value) <> 'object'
      OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_object_keys(option.value) AS field(key)
       WHERE field.key NOT IN ('id','text')
      )
      OR pg_catalog.jsonb_typeof(option.value->'id') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(option.value->'text') IS DISTINCT FROM 'string'
    )
   ))
 )
$function$;
REVOKE ALL ON FUNCTION public.assessment_questions_public_only(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assessment_questions_public_only(jsonb) TO authenticated;
CREATE TABLE public.assessments (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
 lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
 title text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(title)) BETWEEN 1 AND 160),
 instructions text NOT NULL DEFAULT '',
 questions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (public.assessment_questions_public_only(questions)),
 status public.course_status NOT NULL DEFAULT 'draft',
 created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
-- Expected answers are stored separately: enrolled students can read published
-- assessment questions, but never receive this table through their RLS policy.
CREATE TABLE public.assessment_answer_keys (
 assessment_id uuid PRIMARY KEY REFERENCES public.assessments(id) ON DELETE CASCADE,
 answers jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(answers)='object'),
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE TABLE public.assessment_attempts (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_catalog.jsonb_typeof(answers)='object'),
 score numeric(5,2),
 feedback text,
 submitted_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 CONSTRAINT assessment_attempts_score_range CHECK (score IS NULL OR score BETWEEN 0 AND 100)
);
CREATE INDEX assessments_course_status_idx ON public.assessments(course_id,status);
CREATE INDEX assessment_attempts_user_idx ON public.assessment_attempts(user_id,submitted_at DESC);
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_answer_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assessments,public.assessment_answer_keys,public.assessment_attempts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.assessments TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.assessment_answer_keys TO authenticated;
GRANT SELECT ON public.assessment_attempts TO authenticated;
GRANT INSERT (assessment_id,user_id,answers) ON public.assessment_attempts TO authenticated;
GRANT UPDATE (score,feedback) ON public.assessment_attempts TO authenticated;
CREATE POLICY assessments_read_published_or_staff ON public.assessments FOR SELECT TO authenticated USING (
 status='published' AND EXISTS(SELECT 1 FROM public.enrollments e WHERE e.user_id=(SELECT auth.uid()) AND e.course_id=assessments.course_id)
 OR (SELECT app_private.current_actor_role()) IN ('OWNER'::public.app_role,'ADMIN'::public.app_role)
);
CREATE POLICY assessments_staff_insert ON public.assessments FOR INSERT TO authenticated WITH CHECK (
 (SELECT app_private.current_actor_role()) IN ('OWNER'::public.app_role,'ADMIN'::public.app_role)
);
CREATE POLICY assessments_staff_update ON public.assessments FOR UPDATE TO authenticated USING (
 (SELECT app_private.current_actor_role()) IN ('OWNER'::public.app_role,'ADMIN'::public.app_role)
) WITH CHECK ((SELECT app_private.current_actor_role()) IN ('OWNER'::public.app_role,'ADMIN'::public.app_role));
CREATE POLICY assessments_staff_delete ON public.assessments FOR DELETE TO authenticated USING (
 (SELECT app_private.current_actor_role()) IN ('OWNER'::public.app_role,'ADMIN'::public.app_role)
);
CREATE POLICY assessment_answer_keys_staff_all ON public.assessment_answer_keys FOR ALL TO authenticated
 USING ((SELECT app_private.current_actor_role()) IN ('OWNER'::public.app_role,'ADMIN'::public.app_role))
 WITH CHECK ((SELECT app_private.current_actor_role()) IN ('OWNER'::public.app_role,'ADMIN'::public.app_role));
CREATE POLICY attempts_read_own_or_staff ON public.assessment_attempts FOR SELECT TO authenticated USING (
 user_id=(SELECT auth.uid()) OR (SELECT app_private.current_actor_role()) IN ('OWNER'::public.app_role,'ADMIN'::public.app_role)
);
CREATE POLICY attempts_staff_grade ON public.assessment_attempts FOR UPDATE TO authenticated USING (
 (SELECT app_private.current_actor_role()) IN ('OWNER'::public.app_role,'ADMIN'::public.app_role)
) WITH CHECK ((SELECT app_private.current_actor_role()) IN ('OWNER'::public.app_role,'ADMIN'::public.app_role));
CREATE POLICY attempts_submit_own_enrolled ON public.assessment_attempts FOR INSERT TO authenticated WITH CHECK (
 user_id=(SELECT auth.uid()) AND EXISTS(
  SELECT 1 FROM public.assessments a JOIN public.enrollments e ON e.course_id=a.course_id
  WHERE a.id=assessment_id AND a.status='published' AND e.user_id=(SELECT auth.uid())
 )
);
-- Students cannot update/delete attempts or set trusted scores/feedback.
COMMIT;
