-- NETWORKING LEVEL UP — atomic assessment and answer-key writes
-- Apply only after local isolated validation and owner review.
BEGIN;

-- Keep an assessment attached to a lesson in the same course even if the lesson
-- is later reassigned. MATCH SIMPLE permits a NULL lesson_id.
ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_course_id_id_key UNIQUE (course_id, id);
ALTER TABLE public.assessments
  ADD CONSTRAINT assessments_lesson_matches_course_fkey
  FOREIGN KEY (course_id, lesson_id)
  REFERENCES public.lessons (course_id, id);

-- Enforce the route's instructions limit for every write path, including direct
-- Data API writes.
ALTER TABLE public.assessments
  ADD CONSTRAINT assessments_instructions_max_length
  CHECK (pg_catalog.length(instructions) <= 2000);

-- Shared validator used both by the RPC and by deferred integrity triggers, so
-- direct authenticated table writes cannot bypass the definition rules.
CREATE FUNCTION app_private.validate_assessment_definition(
  p_title text,
  p_instructions text,
  p_questions jsonb,
  p_answers jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_question jsonb;
  v_question_id text;
  v_prompt text;
  v_expected text;
  v_question_count integer;
  v_answer_count integer;
  v_option_count integer;
  v_distinct_count bigint;
BEGIN
  IF p_title IS NULL
     OR pg_catalog.length(pg_catalog.btrim(p_title)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid assessment title';
  END IF;
  IF p_instructions IS NULL OR pg_catalog.length(p_instructions) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Assessment instructions must not exceed 2000 characters';
  END IF;
  IF pg_catalog.jsonb_typeof(p_questions) IS DISTINCT FROM 'array'
     OR public.assessment_questions_public_only(p_questions) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid assessment question definition';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_question_count
  FROM pg_catalog.jsonb_array_elements(p_questions);
  IF v_question_count NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Assessment must contain between 1 and 10 questions';
  END IF;

  IF pg_catalog.jsonb_typeof(p_answers) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Answer key must be a JSON object';
  END IF;
  SELECT pg_catalog.count(*)::integer INTO v_answer_count
  FROM pg_catalog.jsonb_object_keys(p_answers);
  IF v_answer_count <> v_question_count OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(p_answers) AS answer(key)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_questions) AS question(value)
      WHERE question.value->>'id' = answer.key
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Answer key must contain exactly one entry for each question';
  END IF;

  SELECT pg_catalog.count(DISTINCT question.value->>'id') INTO v_distinct_count
  FROM pg_catalog.jsonb_array_elements(p_questions) AS question(value);
  IF v_distinct_count <> v_question_count THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Question identifiers must be unique';
  END IF;

  FOR v_question IN
    SELECT question.value
    FROM pg_catalog.jsonb_array_elements(p_questions) AS question(value)
  LOOP
    -- This is deliberately independent of the helper's type check: the RPC and
    -- direct-write trigger both reject every unsupported type explicitly.
    IF v_question->>'type' IS DISTINCT FROM 'single_choice'
       AND v_question->>'type' IS DISTINCT FROM 'short_answer' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported assessment question type';
    END IF;

    v_question_id := v_question->>'id';
    v_prompt := v_question->>'prompt';
    v_expected := p_answers->>v_question_id;
    IF v_question_id IS NULL OR v_question_id !~ '^[A-Za-z0-9_-]{1,32}$'
       OR v_prompt IS NULL OR pg_catalog.length(v_prompt) > 1000
       OR pg_catalog.length(pg_catalog.btrim(v_prompt)) NOT BETWEEN 1 AND 1000
       OR pg_catalog.jsonb_typeof(p_answers->v_question_id) IS DISTINCT FROM 'string'
       OR pg_catalog.length(v_expected) > 1000
       OR pg_catalog.length(pg_catalog.btrim(v_expected)) NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Question and expected answer fields are invalid';
    END IF;

    IF v_question->>'type' = 'single_choice' THEN
      IF pg_catalog.jsonb_typeof(v_question->'options') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Single-choice questions require an options array';
      END IF;
      SELECT pg_catalog.count(*)::integer INTO v_option_count
      FROM pg_catalog.jsonb_array_elements(v_question->'options');
      SELECT pg_catalog.count(DISTINCT option.value->>'id') INTO v_distinct_count
      FROM pg_catalog.jsonb_array_elements(v_question->'options') AS option(value);
      IF v_option_count NOT BETWEEN 2 AND 6 OR v_distinct_count <> v_option_count
         OR EXISTS (
           SELECT 1
           FROM pg_catalog.jsonb_array_elements(v_question->'options') AS option(value)
           WHERE option.value->>'id' IS NULL
              OR option.value->>'id' !~ '^[A-Za-z0-9_-]{1,32}$'
              OR option.value->>'text' IS NULL
              OR pg_catalog.length(option.value->>'text') > 200
              OR pg_catalog.length(pg_catalog.btrim(option.value->>'text')) NOT BETWEEN 1 AND 200
         )
         OR NOT EXISTS (
           SELECT 1
           FROM pg_catalog.jsonb_array_elements(v_question->'options') AS option(value)
           WHERE option.value->>'id' = v_expected
         ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Single-choice answer must identify one of its valid options';
      END IF;
    ELSIF v_question ? 'options' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Short-answer questions cannot contain options';
    END IF;
  END LOOP;
END;
$function$;

-- Checks the final row state visible under the caller's RLS policies. An
-- assessment may disappear because of a legitimate cascade delete; otherwise
-- it must have a matching, fully valid answer key.
CREATE FUNCTION app_private.assert_assessment_answer_key_consistent(p_assessment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_title text;
  v_instructions text;
  v_questions jsonb;
  v_has_answer_key boolean;
  v_answers jsonb;
BEGIN
  SELECT a.title, a.instructions, a.questions,
         (k.assessment_id IS NOT NULL), k.answers
  INTO v_title, v_instructions, v_questions, v_has_answer_key, v_answers
  FROM public.assessments AS a
  LEFT JOIN public.assessment_answer_keys AS k ON k.assessment_id = a.id
  WHERE a.id = p_assessment_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF NOT v_has_answer_key THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Every assessment must have exactly one matching answer key';
  END IF;
  PERFORM app_private.validate_assessment_definition(
    v_title, v_instructions, v_questions, v_answers
  );
END;
$function$;

CREATE FUNCTION app_private.enforce_assessment_answer_key_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'assessments' THEN
    IF TG_OP = 'DELETE' THEN
      PERFORM app_private.assert_assessment_answer_key_consistent(OLD.id);
    ELSE
      PERFORM app_private.assert_assessment_answer_key_consistent(NEW.id);
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      PERFORM app_private.assert_assessment_answer_key_consistent(OLD.assessment_id);
    ELSIF TG_OP = 'UPDATE' THEN
      PERFORM app_private.assert_assessment_answer_key_consistent(OLD.assessment_id);
      IF NEW.assessment_id IS DISTINCT FROM OLD.assessment_id THEN
        PERFORM app_private.assert_assessment_answer_key_consistent(NEW.assessment_id);
      END IF;
    ELSE
      PERFORM app_private.assert_assessment_answer_key_consistent(NEW.assessment_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION app_private.validate_assessment_definition(text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.assert_assessment_answer_key_consistent(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.enforce_assessment_answer_key_consistency()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.validate_assessment_definition(text, text, jsonb, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.assert_assessment_answer_key_consistent(uuid)
  TO authenticated;

-- Fail safely instead of installing the invariant over incompatible existing
-- data; no assessment rows are changed by this migration.
DO $migration$
DECLARE
  v_assessment_id uuid;
BEGIN
  FOR v_assessment_id IN SELECT id FROM public.assessments LOOP
    PERFORM app_private.assert_assessment_answer_key_consistent(v_assessment_id);
  END LOOP;
END;
$migration$;

CREATE CONSTRAINT TRIGGER assessment_definition_consistency_assessments
AFTER INSERT OR UPDATE OR DELETE ON public.assessments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_assessment_answer_key_consistency();

CREATE CONSTRAINT TRIGGER assessment_definition_consistency_answer_keys
AFTER INSERT OR UPDATE OR DELETE ON public.assessment_answer_keys
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_assessment_answer_key_consistency();

CREATE FUNCTION public.save_assessment_definition(
  p_assessment_id uuid,
  p_course_id uuid,
  p_lesson_id uuid,
  p_title text,
  p_instructions text,
  p_questions jsonb,
  p_status public.course_status,
  p_answers jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_assessment_id uuid;
  v_actor_role public.app_role;
BEGIN
  v_actor_role := (SELECT app_private.current_actor_role());
  IF v_actor_role IS DISTINCT FROM 'OWNER'::public.app_role
     AND v_actor_role IS DISTINCT FROM 'ADMIN'::public.app_role THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only OWNER or ADMIN may save assessments';
  END IF;

  PERFORM app_private.validate_assessment_definition(
    p_title, p_instructions, p_questions, p_answers
  );
  IF p_lesson_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lessons AS l
    WHERE l.id = p_lesson_id AND l.course_id = p_course_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Lesson must belong to the selected course';
  END IF;

  IF p_assessment_id IS NULL THEN
    INSERT INTO public.assessments (
      course_id, lesson_id, title, instructions, questions, status, created_by
    ) VALUES (
      p_course_id, p_lesson_id, p_title, p_instructions, p_questions, p_status,
      (SELECT auth.uid())
    )
    RETURNING id INTO v_assessment_id;
  ELSE
    UPDATE public.assessments
    SET course_id = p_course_id,
        lesson_id = p_lesson_id,
        title = p_title,
        instructions = p_instructions,
        questions = p_questions,
        status = p_status,
        updated_at = pg_catalog.now()
    WHERE id = p_assessment_id
    RETURNING id INTO v_assessment_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Assessment not found or not editable';
    END IF;
  END IF;

  INSERT INTO public.assessment_answer_keys (assessment_id, answers, updated_at)
  VALUES (v_assessment_id, p_answers, pg_catalog.now())
  ON CONFLICT (assessment_id) DO UPDATE
    SET answers = EXCLUDED.answers,
        updated_at = EXCLUDED.updated_at;

  RETURN v_assessment_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_assessment_definition(
  uuid, uuid, uuid, text, text, jsonb, public.course_status, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_assessment_definition(
  uuid, uuid, uuid, text, text, jsonb, public.course_status, jsonb
) TO authenticated;

COMMIT;
