-- NETWORKING LEVEL UP — Database Foundation V1
-- This file is a migration definition only. It must be applied to an isolated
-- development database for validation before anyone applies it to production.

BEGIN;

CREATE TYPE public.app_role AS ENUM ('OWNER', 'ADMIN', 'STUDENT');
CREATE TYPE public.course_status AS ENUM ('draft', 'published');
CREATE TYPE public.course_category AS ENUM (
  'networking_fundamentals',
  'ipv4_subnetting',
  'ipv6',
  'switching',
  'routing',
  'packet_tracer'
);

CREATE SCHEMA app_private;
COMMENT ON SCHEMA app_private IS
  'Private authorization helpers; do not add this schema to the Supabase API exposed schemas.';

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text,
  role public.app_role NOT NULL DEFAULT 'STUDENT',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT profiles_display_name_length CHECK (
    display_name IS NULL OR
    pg_catalog.length(pg_catalog.btrim(display_name)) BETWEEN 1 AND 80
  )
);

CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  category public.course_category NOT NULL,
  status public.course_status NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT courses_title_length CHECK (
    pg_catalog.length(pg_catalog.btrim(title)) BETWEEN 1 AND 160
  ),
  CONSTRAINT courses_slug_format CHECK (
    pg_catalog.length(slug) BETWEEN 1 AND 160 AND
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  )
);

CREATE TABLE public.lessons (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  content text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  status public.course_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT lessons_title_length CHECK (
    pg_catalog.length(pg_catalog.btrim(title)) BETWEEN 1 AND 160
  ),
  CONSTRAINT lessons_slug_format CHECK (
    pg_catalog.length(slug) BETWEEN 1 AND 160 AND
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT lessons_sort_order_nonnegative CHECK (sort_order >= 0),
  CONSTRAINT lessons_course_slug_unique UNIQUE (course_id, slug)
);

CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT enrollments_user_course_unique UNIQUE (user_id, course_id)
);

CREATE TABLE public.lesson_progress (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons (id) ON DELETE CASCADE,
  completed_at timestamptz,
  CONSTRAINT lesson_progress_pkey PRIMARY KEY (user_id, lesson_id)
);

-- Foreign-key and RLS-filter indexes not already supplied by primary/unique keys.
CREATE INDEX profiles_role_idx ON public.profiles (role);
CREATE INDEX courses_status_category_idx ON public.courses (status, category);
CREATE INDEX courses_created_by_idx ON public.courses (created_by)
  WHERE created_by IS NOT NULL;
CREATE INDEX lessons_course_status_order_idx
  ON public.lessons (course_id, status, sort_order);
CREATE INDEX enrollments_course_id_idx ON public.enrollments (course_id);
CREATE INDEX lesson_progress_lesson_id_idx ON public.lesson_progress (lesson_id);

-- This helper reads the authoritative role from profiles, not user-controlled
-- Auth metadata. SECURITY DEFINER avoids recursive RLS checks on profiles.
CREATE FUNCTION app_private.current_actor_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.role
  FROM public.profiles AS p
  WHERE p.id = (SELECT auth.uid())
$function$;

-- A fixed transaction-scoped advisory lock serializes role changes and owner
-- deletion checks so concurrent requests cannot remove the final OWNER.
CREATE FUNCTION app_private.set_profile_role(
  p_target_profile_id uuid,
  p_new_role public.app_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_role public.app_role;
  v_target_role public.app_role;
  v_owner_count bigint;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20261119000100::bigint);

  SELECT p.role
  INTO v_actor_role
  FROM public.profiles AS p
  WHERE p.id = (SELECT auth.uid());

  IF v_actor_role IS DISTINCT FROM 'OWNER'::public.app_role THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only an OWNER may change profile roles';
  END IF;

  IF p_target_profile_id IS NULL OR p_new_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22004',
      MESSAGE = 'Target profile and new role are required';
  END IF;

  SELECT p.role
  INTO v_target_role
  FROM public.profiles AS p
  WHERE p.id = p_target_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Target profile does not exist';
  END IF;

  IF v_target_role = 'OWNER'::public.app_role
     AND p_new_role <> 'OWNER'::public.app_role THEN
    SELECT pg_catalog.count(*)
    INTO v_owner_count
    FROM public.profiles AS p
    WHERE p.role = 'OWNER'::public.app_role;

    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'The last OWNER cannot be demoted';
    END IF;
  END IF;

  UPDATE public.profiles AS p
  SET role = p_new_role
  WHERE p.id = p_target_profile_id;
END;
$function$;

-- Trigger-only guard. It also covers profile deletion caused by deleting the
-- corresponding auth.users row through a trusted Auth administration path.
CREATE FUNCTION app_private.protect_last_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner_count bigint;
BEGIN
  IF OLD.role = 'OWNER'::public.app_role THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(20261119000100::bigint);

    SELECT pg_catalog.count(*)
    INTO v_owner_count
    FROM public.profiles AS p
    WHERE p.role = 'OWNER'::public.app_role;

    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'The last OWNER profile cannot be deleted';
    END IF;
  END IF;

  RETURN OLD;
END;
$function$;

CREATE FUNCTION app_private.create_profile_for_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'STUDENT'::public.app_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- No elevated privileges are needed to stamp the timestamp columns.
CREATE FUNCTION app_private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_auth_users_create_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION app_private.create_profile_for_auth_user();

-- Existing Auth accounts receive the least-privileged role. Existing profiles,
-- if any, are left untouched; the migration never chooses an OWNER account.
INSERT INTO public.profiles (id, role)
SELECT u.id, 'STUDENT'::public.app_role
FROM auth.users AS u
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER trg_profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER trg_profiles_protect_last_owner
BEFORE DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION app_private.protect_last_owner();

CREATE TRIGGER trg_courses_set_updated_at
BEFORE UPDATE ON public.courses
FOR EACH ROW
EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER trg_lessons_set_updated_at
BEFORE UPDATE ON public.lessons
FOR EACH ROW
EXECUTE FUNCTION app_private.set_updated_at();

-- Keep the helper schema out of the API. Authenticated needs USAGE only so
-- RLS expressions can invoke the two explicitly granted helpers.
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated;

REVOKE ALL ON TYPE public.app_role, public.course_status, public.course_category
  FROM PUBLIC, anon, authenticated;
GRANT USAGE ON TYPE public.app_role, public.course_status, public.course_category
  TO authenticated;
GRANT USAGE ON TYPE public.course_status, public.course_category TO anon;

REVOKE ALL ON FUNCTION app_private.current_actor_role()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.set_profile_role(uuid, public.app_role)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.protect_last_owner()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.create_profile_for_auth_user()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.set_updated_at()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.current_actor_role() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.set_profile_role(uuid, public.app_role)
  TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE
  public.profiles,
  public.courses,
  public.lessons,
  public.enrollments,
  public.lesson_progress
  FROM PUBLIC, anon, authenticated;

-- Anonymous visitors may read course and lesson rows only where RLS permits.
GRANT SELECT ON TABLE public.courses, public.lessons TO anon;

-- Authenticated users receive only the operations needed by their policies.
GRANT SELECT ON TABLE
  public.profiles,
  public.courses,
  public.lessons,
  public.enrollments,
  public.lesson_progress
  TO authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;

GRANT INSERT (title, slug, description, category, status, created_by)
  ON public.courses TO authenticated;
GRANT UPDATE (title, slug, description, category, status)
  ON public.courses TO authenticated;
GRANT DELETE ON public.courses TO authenticated;

GRANT INSERT (course_id, title, slug, content, sort_order, status)
  ON public.lessons TO authenticated;
GRANT UPDATE (course_id, title, slug, content, sort_order, status)
  ON public.lessons TO authenticated;
GRANT DELETE ON public.lessons TO authenticated;

GRANT INSERT (user_id, course_id) ON public.enrollments TO authenticated;
GRANT UPDATE (user_id, course_id) ON public.enrollments TO authenticated;
GRANT DELETE ON public.enrollments TO authenticated;

GRANT INSERT (user_id, lesson_id, completed_at)
  ON public.lesson_progress TO authenticated;
GRANT UPDATE (completed_at) ON public.lesson_progress TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

-- Profiles: users see their own row; ADMIN sees student profiles; OWNER sees all.
CREATE POLICY profiles_select_self_or_staff
ON public.profiles
FOR SELECT TO authenticated
USING (
  id = (SELECT auth.uid())
  OR (SELECT app_private.current_actor_role()) = 'OWNER'::public.app_role
  OR (
    role = 'STUDENT'::public.app_role
    AND (SELECT app_private.current_actor_role()) = 'ADMIN'::public.app_role
  )
);

-- Column-level grants make display_name the only directly editable profile field.
CREATE POLICY profiles_update_own_display_name
ON public.profiles
FOR UPDATE TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));
-- There are intentionally no profile INSERT or DELETE policies for API roles.

CREATE POLICY courses_select_published_anon
ON public.courses
FOR SELECT TO anon
USING (status = 'published'::public.course_status);

CREATE POLICY courses_select_published_or_staff
ON public.courses
FOR SELECT TO authenticated
USING (
  status = 'published'::public.course_status
  OR (SELECT app_private.current_actor_role())
       IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
);

CREATE POLICY courses_insert_staff
ON public.courses
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT app_private.current_actor_role())
    IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
  AND created_by = (SELECT auth.uid())
);

CREATE POLICY courses_update_staff
ON public.courses
FOR UPDATE TO authenticated
USING (
  (SELECT app_private.current_actor_role())
    IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
)
WITH CHECK (
  (SELECT app_private.current_actor_role())
    IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
);

CREATE POLICY courses_delete_staff
ON public.courses
FOR DELETE TO authenticated
USING (
  (SELECT app_private.current_actor_role())
    IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
);

CREATE POLICY lessons_select_published_anon
ON public.lessons
FOR SELECT TO anon
USING (
  status = 'published'::public.course_status
  AND EXISTS (
    SELECT 1
    FROM public.courses AS c
    WHERE c.id = public.lessons.course_id
      AND c.status = 'published'::public.course_status
  )
);

CREATE POLICY lessons_select_published_or_staff
ON public.lessons
FOR SELECT TO authenticated
USING (
  (
    status = 'published'::public.course_status
    AND EXISTS (
      SELECT 1
      FROM public.courses AS c
      WHERE c.id = public.lessons.course_id
        AND c.status = 'published'::public.course_status
    )
  )
  OR (SELECT app_private.current_actor_role())
       IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
);

CREATE POLICY lessons_insert_staff
ON public.lessons
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT app_private.current_actor_role())
    IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
);

CREATE POLICY lessons_update_staff
ON public.lessons
FOR UPDATE TO authenticated
USING (
  (SELECT app_private.current_actor_role())
    IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
)
WITH CHECK (
  (SELECT app_private.current_actor_role())
    IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
);

CREATE POLICY lessons_delete_staff
ON public.lessons
FOR DELETE TO authenticated
USING (
  (SELECT app_private.current_actor_role())
    IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
);

CREATE POLICY enrollments_select_own_or_staff
ON public.enrollments
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (SELECT app_private.current_actor_role())
       IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
);

CREATE POLICY enrollments_insert_student_or_staff
ON public.enrollments
FOR INSERT TO authenticated
WITH CHECK (
  (
    (SELECT app_private.current_actor_role()) = 'STUDENT'::public.app_role
    AND user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.courses AS c
      WHERE c.id = public.enrollments.course_id
        AND c.status = 'published'::public.course_status
    )
  )
  OR (SELECT app_private.current_actor_role())
       IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
);

CREATE POLICY enrollments_update_staff
ON public.enrollments
FOR UPDATE TO authenticated
USING (
  (SELECT app_private.current_actor_role())
    IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
)
WITH CHECK (
  (SELECT app_private.current_actor_role())
    IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
);

CREATE POLICY enrollments_delete_staff
ON public.enrollments
FOR DELETE TO authenticated
USING (
  (SELECT app_private.current_actor_role())
    IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
);

CREATE POLICY lesson_progress_select_own_enrolled_or_staff
ON public.lesson_progress
FOR SELECT TO authenticated
USING (
  (SELECT app_private.current_actor_role())
    IN ('ADMIN'::public.app_role, 'OWNER'::public.app_role)
  OR (
    (SELECT app_private.current_actor_role()) = 'STUDENT'::public.app_role
    AND user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.enrollments AS e
      JOIN public.lessons AS l
        ON l.id = public.lesson_progress.lesson_id
      JOIN public.courses AS c
        ON c.id = l.course_id
      WHERE e.user_id = public.lesson_progress.user_id
        AND e.user_id = (SELECT auth.uid())
        AND e.course_id = l.course_id
        AND l.status = 'published'::public.course_status
        AND c.status = 'published'::public.course_status
    )
  )
);

CREATE POLICY lesson_progress_insert_own_enrolled_student
ON public.lesson_progress
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT app_private.current_actor_role()) = 'STUDENT'::public.app_role
  AND user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.enrollments AS e
    JOIN public.lessons AS l
      ON l.id = public.lesson_progress.lesson_id
    JOIN public.courses AS c
      ON c.id = l.course_id
    WHERE e.user_id = public.lesson_progress.user_id
      AND e.user_id = (SELECT auth.uid())
      AND e.course_id = l.course_id
      AND l.status = 'published'::public.course_status
      AND c.status = 'published'::public.course_status
  )
);

CREATE POLICY lesson_progress_update_own_enrolled_student
ON public.lesson_progress
FOR UPDATE TO authenticated
USING (
  (SELECT app_private.current_actor_role()) = 'STUDENT'::public.app_role
  AND user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.enrollments AS e
    JOIN public.lessons AS l
      ON l.id = public.lesson_progress.lesson_id
    JOIN public.courses AS c
      ON c.id = l.course_id
    WHERE e.user_id = public.lesson_progress.user_id
      AND e.user_id = (SELECT auth.uid())
      AND e.course_id = l.course_id
      AND l.status = 'published'::public.course_status
      AND c.status = 'published'::public.course_status
  )
)
WITH CHECK (
  (SELECT app_private.current_actor_role()) = 'STUDENT'::public.app_role
  AND user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.enrollments AS e
    JOIN public.lessons AS l
      ON l.id = public.lesson_progress.lesson_id
    JOIN public.courses AS c
      ON c.id = l.course_id
    WHERE e.user_id = public.lesson_progress.user_id
      AND e.user_id = (SELECT auth.uid())
      AND e.course_id = l.course_id
      AND l.status = 'published'::public.course_status
      AND c.status = 'published'::public.course_status
  )
);
-- No lesson_progress DELETE policy or DELETE grant is created.

COMMIT;
