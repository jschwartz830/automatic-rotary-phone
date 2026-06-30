-- Migration 0008 added `deleted_at is null` to the time_entries SELECT
-- policy so archived entries wouldn't be returned. This causes a problem:
-- PostgreSQL re-evaluates SELECT policies against the NEW row after any
-- UPDATE, so setting deleted_at to a non-null value (archiving) violates
-- the SELECT policy and the update is rejected with an RLS error.
--
-- The fix: SELECT RLS should only enforce authorization (household
-- membership), not data-level filtering. The app queries already filter
-- out archived entries with `.is('deleted_at', null)`.
drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries
  for select using (
    public.is_household_member(public.household_id_for_caregiver(caregiver_id))
  );
