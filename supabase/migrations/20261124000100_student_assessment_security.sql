-- NETWORKING LEVEL UP — student assessment access and answer validation
-- Additive hardening for direct authenticated Data API writes.
BEGIN;

-- Validate submitted answers using only the public question definition. This
-- trigger is SECURITY INVOKER, so its assessment lookup remains subject to RLS;
-- it never reads assessment_answer_keys or exposes expected answers.
CREATE FUNCTION app_private.validate_student_assessment_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_questions jsonb;
  v_question jsonb;
  v_question_id text;
  v_answer text;
  v_question_count integer;
  v_answer_count integer;
BEGIN
  IF pg_catalog.jsonb_typeof(NEW.answers) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Student answers must be a JSON object';
  END IF;

  -- RLS on assessments allows the enrolled student to see this row only when
  -- both the assessment and its parent course are published.
  SELECT a.questions INTO v_questions
  FROM public.assessments AS a
  WHERE a.id = NEW.assessment_id
    AND a.status = 'published'::public.course_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Assessment is unavailable';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_question_count
  FROM pg_catalog.jsonb_array_elements(v_questions);
  SELECT pg_catalog.count(*)::integer INTO v_answer_count
  FROM pg_catalog.jsonb_object_keys(NEW.answers);

  IF v_answer_count <> v_question_count OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(NEW.answers) AS answer(key)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(v_questions) AS question(value)
      WHERE question.value->>'id' = answer.key
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Student answers must match the assessment question identifiers';
  END IF;

  FOR v_question IN
    SELECT question.value
    FROM pg_catalog.jsonb_array_elements(v_questions) AS question(value)
  LOOP
    v_question_id := v_question->>'id';
    v_answer := NEW.answers->>v_question_id;

    IF pg_catalog.jsonb_typeof(NEW.answers->v_question_id) IS DISTINCT FROM 'string'
       OR pg_catalog.length(v_answer) > 1000
       OR pg_catalog.length(pg_catalog.btrim(v_answer)) NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Student answer values must be non-empty strings of at most 1000 characters';
    END IF;

    IF v_question->>'type' = 'single_choice' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements(v_question->'options') AS option(value)
        WHERE option.value->>'id' = v_answer
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Single-choice answer must identify one of the question options';
      END IF;
    ELSIF v_question->>'type' IS DISTINCT FROM 'short_answer' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported assessment question type';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app_private.validate_student_assessment_attempt()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.validate_student_assessment_attempt()
  TO authenticated;

CREATE TRIGGER assessment_attempt_validate_answers
BEFORE INSERT ON public.assessment_attempts
FOR EACH ROW
EXECUTE FUNCTION app_private.validate_student_assessment_attempt();

-- Students may read assessment content and their attempts only while the parent
-- course remains published. Staff access continues to use the authoritative
-- OWNER/ADMIN profile role.
DROP POLICY assessments_read_published_or_staff ON public.assessments;
CREATE POLICY assessments_read_published_or_staff ON public.assessments
FOR SELECT TO authenticated
USING (
  (
    status = 'published'::public.course_status
    AND EXISTS (
      SELECT 1
      FROM public.enrollments AS e
      JOIN public.courses AS c ON c.id = e.course_id
      WHERE e.user_id = (SELECT auth.uid())
        AND e.course_id = assessments.course_id
        AND c.status = 'published'::public.course_status
    )
  )
  OR (SELECT app_private.current_actor_role())
       IN ('OWNER'::public.app_role, 'ADMIN'::public.app_role)
);

DROP POLICY attempts_read_own_or_staff ON public.assessment_attempts;
CREATE POLICY attempts_read_own_or_staff ON public.assessment_attempts
FOR SELECT TO authenticated
USING (
  (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.assessments AS a
      JOIN public.courses AS c ON c.id = a.course_id
      WHERE a.id = assessment_attempts.assessment_id
        AND a.status = 'published'::public.course_status
        AND c.status = 'published'::public.course_status
    )
  )
  OR (SELECT app_private.current_actor_role())
       IN ('OWNER'::public.app_role, 'ADMIN'::public.app_role)
);

DROP POLICY attempts_submit_own_enrolled ON public.assessment_attempts;
CREATE POLICY attempts_submit_own_enrolled ON public.assessment_attempts
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.assessments AS a
    JOIN public.enrollments AS e ON e.course_id = a.course_id
    JOIN public.courses AS c ON c.id = a.course_id
    WHERE a.id = assessment_id
      AND a.status = 'published'::public.course_status
      AND e.user_id = (SELECT auth.uid())
      AND c.status = 'published'::public.course_status
  )
);

COMMIT;
