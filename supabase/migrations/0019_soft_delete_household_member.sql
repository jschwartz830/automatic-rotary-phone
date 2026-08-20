-- Spec 10/15.3: household_users.status has a 'removed' value, but removing a
-- member (More.tsx) did a hard delete instead, the only "remove" path in the
-- app with no queryable row left behind. Every RLS helper already checks
-- status = 'active' (migration 0002), so a soft-delete revokes access exactly
-- as well as a hard delete did.
--
-- join_household_by_code() already raises when *any* existing row is found
-- for the household_id/user_id pair, so a 'removed' row continues to block
-- rejoin via the old code with no functional change (QUESTIONS_AND_CLARIFICATIONS.md
-- item 30, option C) -- this migration only sharpens the error message so a
-- removed member sees "you were removed" rather than the more confusing
-- "already a member."
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
  v_existing_status text;
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

  SELECT status INTO v_existing_status
  FROM household_users
  WHERE household_id = v_household_id AND user_id = auth.uid();

  IF v_existing_status = 'removed' THEN
    RAISE EXCEPTION 'You were removed from this household. Ask the household admin to re-invite you.';
  ELSIF v_existing_status IS NOT NULL THEN
    RAISE EXCEPTION 'You are already a member of this household.';
  END IF;

  INSERT INTO household_users (household_id, user_id, role, status, accepted_at)
  VALUES (v_household_id, auth.uid(), v_role, 'active', now());

  RETURN v_household_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_household_by_code(text) TO authenticated;
