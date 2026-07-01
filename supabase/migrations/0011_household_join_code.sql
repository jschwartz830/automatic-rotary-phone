-- Adds a join code to households so nannies can self-serve join without an
-- email invite (which would require a backend function). The parent generates
-- a code in the app; the nanny enters it on their first sign-in.

ALTER TABLE households ADD COLUMN IF NOT EXISTS join_code text;

CREATE UNIQUE INDEX IF NOT EXISTS households_join_code_idx
  ON households(join_code)
  WHERE join_code IS NOT NULL;

-- SECURITY DEFINER so a freshly-authenticated user who has no household
-- membership yet can call this and be added as a nanny. Without DEFINER
-- they couldn't read the households row at all (blocked by RLS).
CREATE OR REPLACE FUNCTION public.join_household_by_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
  v_existing_role text;
BEGIN
  SELECT id INTO v_household_id
  FROM households
  WHERE join_code = upper(trim(p_code));

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Invalid join code. Please check with your employer.';
  END IF;

  SELECT role INTO v_existing_role
  FROM household_users
  WHERE household_id = v_household_id AND user_id = auth.uid();

  IF v_existing_role IS NOT NULL THEN
    RAISE EXCEPTION 'You are already a member of this household.';
  END IF;

  INSERT INTO household_users (household_id, user_id, role, status, accepted_at)
  VALUES (v_household_id, auth.uid(), 'nanny', 'active', now());

  RETURN v_household_id;
END;
$$;

-- Allow any authenticated user to call the function (RLS on the function
-- itself is handled by the SECURITY DEFINER + internal logic above).
GRANT EXECUTE ON FUNCTION public.join_household_by_code(text) TO authenticated;
