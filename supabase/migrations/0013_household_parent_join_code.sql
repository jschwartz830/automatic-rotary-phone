-- Adds a separate join code that admits the joiner as a parent co-admin rather
-- than a nanny. The primary parent generates a distinct "co-parent" code in the
-- app and shares it with their partner, who enters it on their first sign-in.
--
-- We keep a second column (rather than overloading join_code) so the two codes
-- are independent: revoking nanny access never disturbs the co-parent code, and
-- vice versa. The single join_household_by_code() entry point is taught to check
-- both columns and assign the matching role, so the joiner still only ever types
-- one code and never has to know which kind it is.

ALTER TABLE households ADD COLUMN IF NOT EXISTS parent_join_code text;

CREATE UNIQUE INDEX IF NOT EXISTS households_parent_join_code_idx
  ON households(parent_join_code)
  WHERE parent_join_code IS NOT NULL;

-- SECURITY DEFINER so a freshly-authenticated user with no membership yet can
-- call this and be added to the household. Now matches either the nanny code
-- (join_code -> 'nanny') or the co-parent code (parent_join_code ->
-- 'parent_co_admin') and inserts the corresponding role.
CREATE OR REPLACE FUNCTION public.join_household_by_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(trim(p_code));
  v_household_id uuid;
  v_role text;
  v_existing_role text;
BEGIN
  SELECT id, 'nanny' INTO v_household_id, v_role
  FROM households
  WHERE join_code = v_code;

  IF v_household_id IS NULL THEN
    SELECT id, 'parent_co_admin' INTO v_household_id, v_role
    FROM households
    WHERE parent_join_code = v_code;
  END IF;

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
  VALUES (v_household_id, auth.uid(), v_role, 'active', now());

  RETURN v_household_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_household_by_code(text) TO authenticated;
